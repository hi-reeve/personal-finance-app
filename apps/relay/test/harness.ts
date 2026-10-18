import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Request as MiniflareRequest, Response as MiniflareResponse } from "miniflare";
import sodium from "libsodium-wrappers";
import { HEADER_SIGNATURE, HEADER_TIMESTAMP, base64UrlEncode, signingString } from "@pfa/protocol";

const relayDir = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The token the fake Turnstile service accepts. */
export const VALID_TURNSTILE_TOKEN = "valid-token";
/** A token for which the fake Turnstile service is down. */
export const OUTAGE_TURNSTILE_TOKEN = "outage-token";

export interface Relay {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  dispatch: Miniflare["dispatchFetch"];
  dispose: () => Promise<void>;
  /** Every address the Worker called out to, so tests can see where it really sent requests. */
  outboundUrls: string[];
}

/** Builds the Worker and runs it in Cloudflare's local runtime, with a fake Turnstile service. */
export async function startRelay(options: { testMode?: boolean } = {}): Promise<Relay> {
  // Built inside the package: the local runtime failed to start when the build was in the OS temp folder.
  const outdir = join(relayDir, "dist");
  execFileSync(
    join(relayDir, "node_modules/.bin/wrangler"),
    ["deploy", "--dry-run", "--outdir", outdir],
    {
      cwd: relayDir,
      stdio: "ignore",
    },
  );
  const outboundUrls: string[] = [];
  const testMode = options.testMode !== false;
  const mf = new Miniflare({
    modules: true,
    scriptPath: join(outdir, "index.js"),
    compatibilityDate: "2026-08-01",
    durableObjects: { SPACE: { className: "SpaceObject", useSQLite: true } },
    bindings: {
      TURNSTILE_SECRET: "test-secret",
      TURNSTILE_VERIFY_URL: "https://turnstile.test/siteverify",
      ...(testMode ? { TEST_MODE: "1" } : {}),
    },
    outboundService: async (request: MiniflareRequest) => {
      outboundUrls.push(request.url);
      const body = (await request.json()) as { response?: string };
      if (body.response === OUTAGE_TURNSTILE_TOKEN)
        return MiniflareResponse.json(
          { success: false, "error-codes": ["internal-error"] },
          { status: 500 },
        );
      return MiniflareResponse.json({ success: body.response === VALID_TURNSTILE_TOKEN });
    },
  });
  return {
    fetch: (path, init) =>
      mf.dispatchFetch(`http://relay.test${path}`, init as never) as unknown as Promise<Response>,
    dispatch: mf.dispatchFetch.bind(mf),
    dispose: () => mf.dispose(),
    outboundUrls,
  };
}

export interface Client {
  publicKey: string;
  /** Signs like a real client: libsodium Ed25519 over the shared signing string. */
  sign: (method: string, path: string, body?: string, timestamp?: number) => Record<string, string>;
  /** Encrypts like a real client: XChaCha20-Poly1305 with a random nonce, returned as base64url. */
  encrypt: (plaintext: string) => string;
}

export async function newClient(): Promise<Client> {
  await sodium.ready;
  const keys = sodium.crypto_sign_keypair();
  const secretKey = sodium.crypto_secretstream_xchacha20poly1305_keygen();
  return {
    publicKey: base64UrlEncode(keys.publicKey),
    sign(method, path, body = "", timestamp = Date.now()) {
      const bodySha256 = createHash("sha256").update(body).digest("hex");
      const signature = sodium.crypto_sign_detached(
        signingString({ method, path, timestamp, bodySha256 }),
        keys.privateKey,
      );
      return {
        [HEADER_TIMESTAMP]: String(timestamp),
        [HEADER_SIGNATURE]: base64UrlEncode(signature),
      };
    },
    encrypt(plaintext) {
      const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
      const box = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        plaintext,
        null,
        null,
        nonce,
        secretKey,
      );
      return base64UrlEncode(Uint8Array.from([...nonce, ...box]));
    },
  };
}
