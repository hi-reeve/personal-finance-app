import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  PROTOCOL_VERSION,
  type AppendResponse,
  type FetchResponse,
  type WireOp,
} from "@pfa/protocol";
import {
  OUTAGE_TURNSTILE_TOKEN,
  VALID_TURNSTILE_TOKEN,
  newClient,
  startRelay,
  type Client,
  type Relay,
} from "./harness";

let relay: Relay;
beforeAll(async () => {
  relay = await startRelay();
}, 120_000);
afterAll(async () => {
  await relay?.dispose();
});

let counter = 0;
const newSpaceId = () => `space-${Date.now()}-${counter++}`;

async function createSpace(
  client: Client,
  spaceId = newSpaceId(),
  turnstileToken = VALID_TURNSTILE_TOKEN,
) {
  const response = await relay.fetch("/v1/spaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ spaceId, ownerPublicKey: client.publicKey, turnstileToken }),
  });
  return { spaceId, response };
}

function signed(
  client: Client,
  method: string,
  path: string,
  body?: string,
  timestamp?: number,
): RequestInit {
  return {
    method,
    headers: {
      "content-type": "application/json",
      ...client.sign(method, path, body ?? "", timestamp),
    },
    ...(body !== undefined ? { body } : {}),
  };
}

const op = (client: Client, text: string, overrides: Partial<WireOp> = {}): WireOp => ({
  deviceId: "device-1",
  protocolVersion: PROTOCOL_VERSION,
  ciphertext: client.encrypt(text),
  ...overrides,
});

async function append(
  client: Client,
  spaceId: string,
  ops: WireOp[],
  init: Partial<RequestInit> = {},
) {
  const path = `/v1/spaces/${spaceId}/ops`;
  const body = JSON.stringify({ ops });
  return relay.fetch(path, { ...signed(client, "POST", path, body), ...init });
}

async function fetchOps(client: Client, spaceId: string, after: number) {
  const path = `/v1/spaces/${spaceId}/ops?after=${after}`;
  return relay.fetch(path, signed(client, "GET", path));
}

describe("creating a Space", () => {
  it("requires a valid Turnstile token", async () => {
    const client = await newClient();
    expect((await createSpace(client, undefined, "")).response.status).toBe(403);
    expect((await createSpace(client, undefined, "forged-token")).response.status).toBe(403);
    expect((await createSpace(client)).response.status).toBe(201);
  });

  it("refuses to create the same Space twice", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    expect((await createSpace(client, spaceId)).response.status).toBe(409);
  });

  it("refuses a malformed request", async () => {
    const response = await relay.fetch("/v1/spaces", { method: "POST", body: "{nope" });
    expect(response.status).toBe(400);
  });
});

describe("appending and fetching ops", () => {
  it("returns everything after a position, in order, with the ciphertext untouched", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const sent = [op(client, "one"), op(client, "two"), op(client, "three")];

    const appended = (await (await append(client, spaceId, sent)).json()) as AppendResponse;
    expect(appended).toEqual({ firstSeq: 1, lastSeq: 3 });

    const all = (await (await fetchOps(client, spaceId, 0)).json()) as FetchResponse;
    expect(all.latest).toBe(3);
    expect(all.ops.map((o) => o.seq)).toEqual([1, 2, 3]);
    expect(all.ops.map((o) => o.ciphertext)).toEqual(sent.map((o) => o.ciphertext));
    expect(
      all.ops.every((o) => o.deviceId === "device-1" && o.protocolVersion === PROTOCOL_VERSION),
    ).toBe(true);

    const rest = (await (await fetchOps(client, spaceId, 2)).json()) as FetchResponse;
    expect(rest.ops.map((o) => o.seq)).toEqual([3]);
    const none = (await (await fetchOps(client, spaceId, 3)).json()) as FetchResponse;
    expect(none.ops).toEqual([]);
    expect(none.latest).toBe(3);
  });

  it("keeps numbering across separate appends", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    await append(client, spaceId, [op(client, "a")]);
    const second = (await (
      await append(client, spaceId, [op(client, "b"), op(client, "c")])
    ).json()) as AppendResponse;
    expect(second).toEqual({ firstSeq: 2, lastSeq: 3 });
  });

  it("keeps each Space separate and rejects unknown Spaces", async () => {
    const client = await newClient();
    const a = (await createSpace(client)).spaceId;
    const b = (await createSpace(client)).spaceId;
    await append(client, a, [op(client, "only in a")]);

    expect(((await (await fetchOps(client, b, 0)).json()) as FetchResponse).ops).toEqual([]);
    expect((await fetchOps(client, "no-such-space", 0)).status).toBe(404);
  });

  it("refuses ops from a client older than the Space requires, and oversized ops", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    expect(
      (await append(client, spaceId, [op(client, "old", { protocolVersion: 0 })])).status,
    ).toBe(426);
    expect(
      (await append(client, spaceId, [op(client, "x", { ciphertext: "A".repeat(100_000) })]))
        .status,
    ).toBe(413);
    expect((await append(client, spaceId, [])).status).toBe(400);
    expect(((await (await fetchOps(client, spaceId, 0)).json()) as FetchResponse).ops).toEqual([]);
  });
});

describe("request signatures", () => {
  it("accepts a signature made by libsodium, as real clients make them", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    expect((await append(client, spaceId, [op(client, "signed")])).status).toBe(200);
  });

  it("refuses unsigned requests, other keys, tampered bodies and stale timestamps", async () => {
    const client = await newClient();
    const stranger = await newClient();
    const { spaceId } = await createSpace(client);
    const path = `/v1/spaces/${spaceId}/ops`;
    const body = JSON.stringify({ ops: [op(client, "x")] });

    const unsigned = await relay.fetch(path, { method: "POST", body });
    expect(unsigned.status).toBe(401);

    const wrongKey = await relay.fetch(path, signed(stranger, "POST", path, body));
    expect(wrongKey.status).toBe(401);

    const tampered = await relay.fetch(path, {
      ...signed(client, "POST", path, body),
      body: body.replace("device-1", "device-2"),
    });
    expect(tampered.status).toBe(401);

    const stale = await relay.fetch(
      path,
      signed(client, "POST", path, body, Date.now() - 10 * 60 * 1000),
    );
    expect(stale.status).toBe(401);

    const wrongPath = await relay.fetch(
      `/v1/spaces/${spaceId}/ops?after=0`,
      signed(client, "GET", path),
    );
    expect(wrongPath.status).toBe(401);
  });
});

describe("live notifications", () => {
  it("tells a connected device when new ops arrive", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const path = `/v1/spaces/${spaceId}/live`;
    const upgrade = await relay.dispatch(`http://relay.test${path}`, {
      headers: { upgrade: "websocket", ...client.sign("GET", path) },
    });
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket!;
    socket.accept();
    const message = new Promise<string>((resolve) =>
      socket.addEventListener("message", (event) => resolve(String(event.data))),
    );

    await append(client, spaceId, [op(client, "ping")]);
    expect(JSON.parse(await message)).toEqual({ type: "ops", latest: 1 });
    socket.close();
  });
});

describe("storage cost", () => {
  it("writes one database row per op, because the free tier counts rows written", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const rows = (response: Response) => Number(response.headers.get("x-debug-rows-written"));
    expect(rows(await append(client, spaceId, [op(client, "x")]))).toBe(1);
    expect(
      rows(
        await append(
          client,
          spaceId,
          Array.from({ length: 5 }, (_, i) => op(client, `y${i}`)),
        ),
      ),
    ).toBe(5);
  });

  it("does not report row counts unless cost debugging is on", async () => {
    const quiet = await startRelay({ testMode: false });
    try {
      const client = await newClient();
      const spaceId = newSpaceId();
      await quiet.fetch("/v1/spaces", {
        method: "POST",
        body: JSON.stringify({
          spaceId,
          ownerPublicKey: client.publicKey,
          turnstileToken: VALID_TURNSTILE_TOKEN,
        }),
      });
      const path = `/v1/spaces/${spaceId}/ops`;
      const body = JSON.stringify({ ops: [op(client, "x")] });
      const response = await quiet.fetch(path, {
        method: "POST",
        headers: client.sign("POST", path, body),
        body,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-debug-rows-written")).toBeNull();
    } finally {
      await quiet.dispose();
    }
  }, 60_000);
});

describe("hostile and broken requests", () => {
  const post = (path: string, body: string, headers: Record<string, string> = {}) =>
    relay.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });

  it.each([["null"], ["[]"], ['"text"'], ["42"], ["{}"]])(
    "answers 400, not a crash, to a create request of %s",
    async (body) => {
      expect((await post("/v1/spaces", body)).status).toBe(400);
    },
  );

  it("answers 413 to an oversized create request", async () => {
    const big = JSON.stringify({
      spaceId: "x".repeat(10_000),
      ownerPublicKey: "a",
      turnstileToken: "b",
    });
    expect((await post("/v1/spaces", big)).status).toBe(413);
  });

  it.each([
    ["null", "null"],
    ["a non-object op", JSON.stringify({ ops: [null] })],
    ["ops that is not a list", JSON.stringify({ ops: "x" })],
    ["a missing device id", JSON.stringify({ ops: [{ protocolVersion: 1, ciphertext: "AAAA" }] })],
    [
      "an enormous device id",
      JSON.stringify({
        ops: [{ deviceId: "d".repeat(500), protocolVersion: 1, ciphertext: "AAAA" }],
      }),
    ],
    [
      "a huge protocol version",
      JSON.stringify({ ops: [{ deviceId: "d", protocolVersion: 1e9, ciphertext: "AAAA" }] }),
    ],
    [
      "a non-integer protocol version",
      JSON.stringify({ ops: [{ deviceId: "d", protocolVersion: 1.5, ciphertext: "AAAA" }] }),
    ],
  ])("answers 400, not a crash, to an append with %s", async (_name, body) => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const path = `/v1/spaces/${spaceId}/ops`;
    expect((await post(path, body, client.sign("POST", path, body))).status).toBe(400);
  });

  it("answers 413 to too many ops in one append and to an oversized request body", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const path = `/v1/spaces/${spaceId}/ops`;
    const tooMany = JSON.stringify({
      ops: Array.from({ length: 101 }, () => ({
        deviceId: "d",
        protocolVersion: 1,
        ciphertext: "AAAA",
      })),
    });
    expect((await post(path, tooMany, client.sign("POST", path, tooMany))).status).toBe(413);
    const huge = JSON.stringify({
      ops: [{ deviceId: "d", protocolVersion: 1, ciphertext: "A".repeat(2_000_000) }],
    });
    expect((await post(path, huge, client.sign("POST", path, huge))).status).toBe(413);
  });

  it("does not wake a Space for a request that is plainly not signed", async () => {
    // A valid-looking id nobody created: unsigned requests are turned away before reaching any storage.
    expect((await relay.fetch(`/v1/spaces/${newSpaceId()}/ops?after=0`)).status).toBe(401);
    const client = await newClient();
    const path = `/v1/spaces/${newSpaceId()}/ops?after=0`;
    const stale = await relay.fetch(
      path,
      signed(client, "GET", path, undefined, Date.now() - 3_600_000),
    );
    expect(stale.status).toBe(401);
  });

  it("returns a bounded amount per fetch and lets the client continue from where it stopped", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const bigOp = () => op(client, "x".repeat(40_000));
    for (let batch = 0; batch < 4; batch++) {
      expect((await append(client, spaceId, Array.from({ length: 8 }, bigOp))).status).toBe(200);
    }
    const first = (await (await fetchOps(client, spaceId, 0)).json()) as FetchResponse;
    expect(first.latest).toBe(32);
    expect(first.ops.length).toBeGreaterThan(0);
    expect(first.ops.length).toBeLessThan(32);

    let after = first.ops[first.ops.length - 1]!.seq;
    let total = first.ops.length;
    while (after < first.latest) {
      const next = (await (await fetchOps(client, spaceId, after)).json()) as FetchResponse;
      total += next.ops.length;
      after = next.ops[next.ops.length - 1]!.seq;
    }
    expect(total).toBe(32);
  }, 60_000);
});

describe("Turnstile outages", () => {
  it("tells the client to retry when the check cannot be made, instead of calling the token bad", async () => {
    const client = await newClient();
    expect((await createSpace(client, undefined, OUTAGE_TURNSTILE_TOKEN)).response.status).toBe(
      503,
    );
  });
});

describe("test-only settings", () => {
  it("are ignored unless test mode is on, so a stray setting cannot redirect the Turnstile check", async () => {
    const production = await startRelay({ testMode: false });
    try {
      const client = await newClient();
      await production.fetch("/v1/spaces", {
        method: "POST",
        body: JSON.stringify({
          spaceId: newSpaceId(),
          ownerPublicKey: client.publicKey,
          turnstileToken: VALID_TURNSTILE_TOKEN,
        }),
      });
      expect(production.outboundUrls).toEqual([
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      ]);
    } finally {
      await production.dispose();
    }
  }, 60_000);
});

describe("live connections", () => {
  it("turns away an unsigned upgrade", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const response = await relay.dispatch(`http://relay.test/v1/spaces/${spaceId}/live`, {
      headers: { upgrade: "websocket" },
    });
    expect(response.status).toBe(401);
  });

  it("keeps working after a device disconnects", async () => {
    const client = await newClient();
    const { spaceId } = await createSpace(client);
    const path = `/v1/spaces/${spaceId}/live`;
    const upgrade = await relay.dispatch(`http://relay.test${path}`, {
      headers: { upgrade: "websocket", ...client.sign("GET", path) },
    });
    const socket = upgrade.webSocket!;
    socket.accept();
    socket.close(); // no close code at all, the way browsers often leave
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect((await append(client, spaceId, [op(client, "after disconnect")])).status).toBe(200);
  });
});
