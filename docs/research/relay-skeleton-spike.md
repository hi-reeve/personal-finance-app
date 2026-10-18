# Relay skeleton spike: findings

Built and run on 2026-10-18 for the ticket "Relay skeleton spike". Everything below marked **measured** was observed locally in Cloudflare's own runtime (`workerd`, through Miniflare). Nothing was deployed, so real free-tier counters are **not** measured.

## What was built

- A Worker that creates a Space (gated by Turnstile) and routes signed requests to one SQLite-backed Durable Object per Space.
- The object appends opaque encrypted ops, assigns sequence numbers, serves everything after position N, and tells connected devices over a hibernating WebSocket when new ops arrive.
- The wire format lives in the protocol package (types, signing string, base64url) so the relay and every client share it.
- 11 relay tests drive the **built** Worker over HTTP, with a client that signs with libsodium and encrypts with XChaCha20-Poly1305, exactly as real clients will.

## Findings

### libsodium does not run inside a Worker (measured)

- `libsodium-wrappers` bundles only with the `nodejs_compat` flag (it imports Node's `crypto`), and then adds 467 KiB (152 KiB gzipped) to the Worker.
- In the runtime, `await sodium.ready` never finishes. The runtime cancels the request as "hung". The cause was not diagnosed further (likely WebAssembly initialisation).
- **Decision for the spike: the relay does not use libsodium.** It never decrypts, so it only needs to check Ed25519 signatures, which the runtime's built-in WebCrypto does. The Worker is 9.5 KiB (3.4 KiB gzipped) without it.
- **Interop is proven:** signatures made by libsodium in Node verify in the Worker with WebCrypto Ed25519 (test "accepts a signature made by libsodium").
- Consequence for the client: encryption stays libsodium on clients only. If the server ever needs to decrypt (it should not), this finding must be revisited.

### Free-tier storage cost (measured rows, estimated capacity)

- With `AUTOINCREMENT`, each op wrote **2** database rows (the op and SQLite's sequence bookkeeping). With a plain integer primary key it writes **1**. The spike uses the plain key; this is safe because v1 never deletes ops, so row ids only grow. A test locks in one row per op.
- The Free plan allows 100,000 rows written per day for Durable Objects across the account (from `docs/research/cloudflare-free-tier.md`). At 1 row per op that is up to about **100,000 ops per day for all Spaces together**, before counting any other write. At 2 rows it would have been about 50,000.
- Not measured: rows read per fetch, Worker and Durable Object request counts on a deployed account, duration charges. These need a deployment and the account dashboard.

### WebSocket hibernation (works; cost unmeasured)

- The object accepts sockets with the hibernation API. A connected device receives `{type: "ops", latest}` when ops are appended (test "tells a connected device when new ops arrive").
- The server only sends; it never reads incoming messages, so Cloudflare's "20 incoming messages count as 1 request" rule is not a factor.
- Not measured: whether the object really sleeps between pushes, the wake-up behaviour, and the effect on the free-tier duration and request counters. Needs a deployment.

### Tooling findings

- `@cloudflare/vitest-pool-workers` 0.23 requires Vitest 4.1; Vite+ pins Vitest 5.0.5. The Workers test pool cannot be used here. Tests build the Worker with `wrangler deploy --dry-run` and run it in Miniflare from an ordinary Vitest test, which still tests the real wire protocol.
- pnpm 11 blocks install scripts by default. `esbuild` and `workerd` are now approved explicitly in `pnpm-workspace.yaml`.
- The local runtime only supports compatibility dates up to the workerd binary's release (2026-08-01 today). Bump together with the `wrangler` and `miniflare` versions.
- The local runtime failed to start when the built Worker sat in the OS temp folder, and started when it sat in the package's own `dist` folder. Cause unknown; the test harness builds into `dist`.

## Design notes and open points for the next tickets

- Only the Space owner key signs requests in this spike. Per-device keys, registration at pairing and revocation belong to the pairing tickets.
- Replay protection is a five-minute timestamp window only. A per-request nonce is not implemented.
- An unknown Space answers 404 before its signature is checked, which reveals whether a Space id exists. Decide whether that matters when quotas and abuse limits are built.
- No quotas, circuit breaker or expiry yet; those are in the ticket "Relay: Spaces, quotas, breaker, expiry".
- Turnstile is verified with a JSON call to the siteverify endpoint and fails closed on any error. The widget in the PWA is not built.
