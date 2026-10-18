# Relay skeleton spike: findings

Built and run on 2026-10-18 for the ticket "Relay skeleton spike". Everything below marked **measured** was observed locally in Cloudflare's own runtime (`workerd`, through Miniflare). Nothing was deployed, so real free-tier counters are **not** measured.

## What was built

- A Worker that creates a Space (gated by Turnstile) and routes signed requests to one SQLite-backed Durable Object per Space.
- The object appends opaque encrypted ops, assigns sequence numbers, serves everything after position N, and tells connected devices over a hibernating WebSocket when new ops arrive.
- The wire format lives in the protocol package (types, signing string, base64url) so the relay and every client share it.
- 32 relay tests (some parameterised) drive the **built** Worker over HTTP, with a client that signs with libsodium and encrypts with XChaCha20-Poly1305, exactly as real clients will.

## Findings

### libsodium does not run inside a Worker (measured)

- `libsodium-wrappers` bundles only with the `nodejs_compat` flag (it imports Node's `crypto`), and then adds 467 KiB (152 KiB gzipped) to the Worker (sizes from `wrangler deploy --dry-run`). The flag is no longer set, since nothing needs it.
- In the runtime, `await sodium.ready` never finishes. The runtime cancels the request as "hung". The cause was not diagnosed further (likely WebAssembly initialisation).
- **Decision for the spike: the relay does not use libsodium.** It never decrypts, so it only needs to check Ed25519 signatures, which the runtime's built-in WebCrypto does. The Worker is 9.5 KiB (3.4 KiB gzipped) without it.
- **Interop is proven:** signatures made by libsodium in Node verify in the Worker with WebCrypto Ed25519 (test "accepts a signature made by libsodium").
- Consequence for the client: encryption stays libsodium on clients only. If the server ever needs to decrypt (it should not), this finding must be revisited.

### Free-tier storage cost (measured rows, estimated capacity)

- With `AUTOINCREMENT`, each op wrote **2** database rows (the op and SQLite's sequence bookkeeping), measured with a temporary test that appended 1, 5, 20 and 100 ops and read SQLite's row counter (2, 10, 40, 200). With a plain integer primary key it writes **1**. The spike uses the plain key; this is safe because v1 never deletes ops, so row ids only grow. A test locks in one row per op.
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

## Hardening added after review

- Bad bodies (`null`, arrays, wrong shapes) answer 400 instead of crashing; oversized requests answer 413. Limits live in the protocol package: 4 KiB to create a Space, 1 MiB and 100 ops per append, 64 KiB per op, 64-character device ids, and about 1 MiB of ciphertext per fetch (clients continue from the last position they received).
- Requests that are not even shaped like signed ones (missing or malformed headers, stale timestamp) are turned away by the Worker before any Space is woken, so junk traffic cannot create storage or spend Durable Object requests.
- A Turnstile outage answers 503 (retry) instead of 403 (bad token). Both fail closed. The check has a 5-second timeout.
- Settings that exist only for tests (redirecting the Turnstile check, row-count headers) are ignored unless `TEST_MODE` is set, so a stray production setting cannot disable the check.
- Closing a WebSocket and failing to notify one no longer break an append.

## Open design points for the next tickets

These were found by review and are deliberately **not** fixed in the skeleton:

- **Replay.** The five-minute timestamp window does not stop a captured append from being replayed inside it, which would duplicate ops. The fix is idempotency: ops need a unique client-chosen id that the relay ignores a second time. This changes the wire format, so decide it in the sync client ticket.
- **WebSocket auth for browsers.** The live connection is authenticated with signed headers, which a browser `WebSocket` cannot send. The PWA needs another way, such as a short-lived one-time ticket obtained with a signed request and passed in the connection URL. Native apps and Tauri can send headers, so this affects the PWA only.
- **Per-device keys.** Only the Space owner key signs requests. Device registration and revocation belong to the pairing tickets.
- **Protocol gate.** The minimum version is stored per Space but only checked on append, nothing can raise it, and reads are not gated. Decide how clients learn the minimum (for example a header on every response).
- **Existence of a Space.** An unknown Space answers 404 so a client can tell it must re-seed after expiry. This does reveal that an id is unused, but real ids are derived from a 256-bit secret and cannot be guessed. If ids were ever short, revisit.
- **Quotas, circuit breaker, expiry** are in the ticket "Relay: Spaces, quotas, breaker, expiry". Plain integer row ids are safe only while the newest ops are never deleted; expiry must remove whole Spaces, not the tail.
- **Hibernation correctness** is untested. The live test shows a push arrives but never forces the object to sleep and wake; that needs a deployment or a runtime that can evict objects on demand.
- Turnstile responses are not checked for `hostname` or `action`; add when the widget exists.
- Turnstile is verified with a JSON call and fails closed. The widget in the PWA is not built.
