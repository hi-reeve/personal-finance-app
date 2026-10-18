import { DurableObject } from "cloudflare:workers";
import {
  MAX_APPEND_BODY_BYTES,
  MAX_DEVICE_ID_LENGTH,
  MAX_FETCH_BYTES,
  MAX_OPS_PER_APPEND,
  MAX_OP_BYTES,
  MAX_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  base64UrlDecode,
  base64UrlEncode,
  type AppendResponse,
  type FetchResponse,
  type StoredOp,
} from "@pfa/protocol";
import { isSignedBy } from "./auth";
import { isTestMode, type Env } from "./env";
import { readText } from "./http";

const badRequest = () => new Response("Bad request", { status: 400 });

interface Row {
  deviceId: string;
  protocolVersion: number;
  bytes: Uint8Array<ArrayBuffer>;
}

/** Checks one op from an append request. Returns the row to store, or the response to send back. */
function parseOp(op: unknown, minProtocol: number): Row | Response {
  if (typeof op !== "object" || op === null) return badRequest();
  const { deviceId, protocolVersion, ciphertext } = op as Record<string, unknown>;
  if (
    typeof deviceId !== "string" ||
    deviceId.length === 0 ||
    deviceId.length > MAX_DEVICE_ID_LENGTH
  )
    return badRequest();
  if (typeof ciphertext !== "string") return badRequest();
  if (
    !Number.isInteger(protocolVersion) ||
    (protocolVersion as number) < 0 ||
    (protocolVersion as number) > MAX_PROTOCOL_VERSION
  ) {
    return badRequest();
  }
  if ((protocolVersion as number) < minProtocol)
    return new Response("Update required", { status: 426 });
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64UrlDecode(ciphertext);
  } catch {
    return badRequest();
  }
  if (bytes.length > MAX_OP_BYTES) return new Response("Op too large", { status: 413 });
  return { deviceId, protocolVersion: protocolVersion as number, bytes };
}

/** One Space: an append-only log of opaque encrypted ops, plus who may read and write it. */
export class SpaceObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      );
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS ops (
        -- No AUTOINCREMENT: it costs a second row write per op. Ops are never deleted from the end in v1,
        -- so row ids only grow. Do not add a feature that deletes the newest ops without revisiting this.
        seq INTEGER PRIMARY KEY,
        device_id TEXT NOT NULL,
        protocol_version INTEGER NOT NULL,
        ciphertext BLOB NOT NULL
      )`);
    });
  }

  private meta(key: string): string | undefined {
    return this.ctx.storage.sql
      .exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key)
      .toArray()[0]?.value;
  }

  /** Sets up the Space. Returns false if it already exists. */
  create(ownerPublicKey: string): boolean {
    if (this.meta("owner") !== undefined) return false;
    this.ctx.storage.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('owner', ?), ('min_protocol', ?)`,
      ownerPublicKey,
      String(PROTOCOL_VERSION),
    );
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const owner = this.meta("owner");
    if (owner === undefined) return new Response("Unknown space", { status: 404 });

    const body = request.method === "POST" ? await readText(request, MAX_APPEND_BODY_BYTES) : "";
    if (body instanceof Response) return body;
    if (!(await isSignedBy(request, body, owner)))
      return new Response("Bad signature", { status: 401 });

    const url = new URL(request.url);
    const route = url.pathname.split("/")[4];
    if (route === "live" && request.headers.get("upgrade") === "websocket") return this.live();
    if (route === "ops" && request.method === "POST") return this.append(body);
    if (route === "ops" && request.method === "GET") return this.read(url);
    return new Response("Not found", { status: 404 });
  }

  private append(body: string): Response {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return badRequest();
    }
    const ops =
      typeof parsed === "object" && parsed !== null ? (parsed as { ops?: unknown }).ops : undefined;
    if (!Array.isArray(ops) || ops.length === 0) return badRequest();
    if (ops.length > MAX_OPS_PER_APPEND) return new Response("Too many ops", { status: 413 });

    const minProtocol = Number(this.meta("min_protocol"));
    const rows: Row[] = [];
    for (const op of ops) {
      const row = parseOp(op, minProtocol);
      if (row instanceof Response) return row;
      rows.push(row);
    }

    let rowsWritten = 0;
    const seqs = this.ctx.storage.transactionSync(() =>
      rows.map((row) => {
        const cursor = this.ctx.storage.sql.exec<{ seq: number }>(
          `INSERT INTO ops (device_id, protocol_version, ciphertext) VALUES (?, ?, ?) RETURNING seq`,
          row.deviceId,
          row.protocolVersion,
          row.bytes,
        );
        const seq = cursor.one().seq;
        rowsWritten += cursor.rowsWritten;
        return seq;
      }),
    );

    const lastSeq = seqs[seqs.length - 1]!;
    this.notify(lastSeq);

    const response: AppendResponse = { firstSeq: seqs[0]!, lastSeq };
    const headers: Record<string, string> = isTestMode(this.env)
      ? { "x-debug-rows-written": String(rowsWritten) }
      : {};
    return Response.json(response, { headers });
  }

  /** Tells connected devices there is news. A dead connection must never fail an append that already committed. */
  private notify(latest: number): void {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type: "ops", latest }));
      } catch {
        // The device is gone; it will catch up when it next fetches.
      }
    }
  }

  private read(url: URL): Response {
    const after = Number(url.searchParams.get("after") ?? "0");
    if (!Number.isSafeInteger(after) || after < 0) return badRequest();
    const cursor = this.ctx.storage.sql.exec<{
      seq: number;
      device_id: string;
      protocol_version: number;
      ciphertext: ArrayBuffer;
    }>(
      `SELECT seq, device_id, protocol_version, ciphertext FROM ops WHERE seq > ? ORDER BY seq`,
      after,
    );

    // Stop once about MAX_FETCH_BYTES of ciphertext is collected (always at least one op); the client
    // asks again from the last position it received.
    const ops: StoredOp[] = [];
    let bytes = 0;
    for (const row of cursor) {
      if (ops.length > 0 && bytes + row.ciphertext.byteLength > MAX_FETCH_BYTES) break;
      bytes += row.ciphertext.byteLength;
      ops.push({
        seq: row.seq,
        deviceId: row.device_id,
        protocolVersion: row.protocol_version,
        ciphertext: base64UrlEncode(new Uint8Array(row.ciphertext)),
      });
    }
    const latest =
      this.ctx.storage.sql
        .exec<{ latest: number | null }>(`SELECT MAX(seq) AS latest FROM ops`)
        .one().latest ?? 0;
    const response: FetchResponse = { latest, ops };
    return Response.json(response);
  }

  /** Hibernating WebSocket: the object can sleep between messages and is woken when ops arrive. */
  private live(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(socket: WebSocket): void {
    try {
      socket.close(1000);
    } catch {
      // Already closed.
    }
  }

  webSocketError(socket: WebSocket): void {
    this.webSocketClose(socket);
  }
}
