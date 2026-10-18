import { DurableObject } from "cloudflare:workers";
import {
  MAX_OP_BYTES,
  PROTOCOL_VERSION,
  base64UrlDecode,
  base64UrlEncode,
  type AppendRequest,
  type AppendResponse,
  type FetchResponse,
} from "@pfa/protocol";
import { isSignedBy } from "./auth";
import type { Env } from "./env";

const FETCH_LIMIT = 500;

/** One Space: an append-only log of opaque encrypted ops, plus who may read and write it. */
export class SpaceObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      );
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS ops (
        -- No AUTOINCREMENT: it costs a second row write per op. Ops are never deleted in v1, so row ids only grow.
        seq INTEGER PRIMARY KEY,
        device_id TEXT NOT NULL,
        protocol_version INTEGER NOT NULL,
        ciphertext BLOB NOT NULL
      )`);
    });
  }

  private meta(key: string): string | undefined {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key)
      .toArray()[0];
    return row?.value;
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

    const body = request.method === "POST" ? await request.text() : "";
    if (!(await isSignedBy(request, body, owner)))
      return new Response("Bad signature", { status: 401 });

    const route = new URL(request.url).pathname.split("/")[4];
    if (route === "live" && request.headers.get("upgrade") === "websocket") return this.live();
    if (route === "ops" && request.method === "POST") return this.append(body);
    if (route === "ops" && request.method === "GET") return this.read(new URL(request.url));
    return new Response("Not found", { status: 404 });
  }

  private append(body: string): Response {
    let parsed: AppendRequest;
    try {
      parsed = JSON.parse(body) as AppendRequest;
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (!Array.isArray(parsed.ops) || parsed.ops.length === 0)
      return new Response("Bad request", { status: 400 });

    const minProtocol = Number(this.meta("min_protocol"));
    const rows: { deviceId: string; protocolVersion: number; bytes: Uint8Array }[] = [];
    for (const op of parsed.ops) {
      if (
        typeof op.deviceId !== "string" ||
        typeof op.ciphertext !== "string" ||
        !Number.isInteger(op.protocolVersion)
      ) {
        return new Response("Bad request", { status: 400 });
      }
      if (op.protocolVersion < minProtocol) return new Response("Update required", { status: 426 });
      let bytes: Uint8Array;
      try {
        bytes = base64UrlDecode(op.ciphertext);
      } catch {
        return new Response("Bad request", { status: 400 });
      }
      if (bytes.length > MAX_OP_BYTES) return new Response("Op too large", { status: 413 });
      rows.push({ deviceId: op.deviceId, protocolVersion: op.protocolVersion, bytes });
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
    for (const socket of this.ctx.getWebSockets())
      socket.send(JSON.stringify({ type: "ops", latest: lastSeq }));

    const response: AppendResponse = { firstSeq: seqs[0]!, lastSeq };
    const headers: Record<string, string> =
      this.env.DEBUG_COSTS === "1" ? { "x-debug-rows-written": String(rowsWritten) } : {};
    return Response.json(response, { headers });
  }

  private read(url: URL): Response {
    const after = Number(url.searchParams.get("after") ?? "0");
    if (!Number.isInteger(after) || after < 0) return new Response("Bad request", { status: 400 });
    const rows = this.ctx.storage.sql
      .exec<{ seq: number; device_id: string; protocol_version: number; ciphertext: ArrayBuffer }>(
        `SELECT seq, device_id, protocol_version, ciphertext FROM ops WHERE seq > ? ORDER BY seq LIMIT ?`,
        after,
        FETCH_LIMIT,
      )
      .toArray();
    const latest =
      this.ctx.storage.sql
        .exec<{ latest: number | null }>(`SELECT MAX(seq) AS latest FROM ops`)
        .one().latest ?? 0;
    const response: FetchResponse = {
      latest,
      ops: rows.map((row) => ({
        seq: row.seq,
        deviceId: row.device_id,
        protocolVersion: row.protocol_version,
        ciphertext: base64UrlEncode(new Uint8Array(row.ciphertext)),
      })),
    };
    return Response.json(response);
  }

  /** Hibernating WebSocket: the object can sleep between messages and is woken when ops arrive. */
  private live(): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketClose(socket: WebSocket, code: number): void {
    socket.close(code);
  }
}
