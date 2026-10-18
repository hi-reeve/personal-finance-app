# Local-first sync and CRDT options for an E2EE relay

Researched 2026-10-14. Docs-level research only, nothing prototyped. Evolu's docs were the only ones that spoke to encryption and relay behavior in detail.

## Options

| Option                      | What it is                                                                                                                                    | E2EE with a blind relay                                                                                                                       | Fit                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evolu** (MIT)             | Local-first platform + TypeScript library on SQLite-WASM; CRDT-tagged sync protocol; relays for sync and backup                               | Yes, by default. Each change padded (PADMÉ) then XChaCha20-Poly1305 under a 256-bit key; on-device DB encrypted via SQLCipher on web/Electron | Closest match to the design                                                                                                                  |
| **Automerge**               | CRDT library; sync is network-agnostic (WebSocket, WebRTC, etc.); history kept                                                                | Not covered by the docs; a `keyhive` API is listed as "coming soon". Encrypting update blobs yourself is possible but unspecified             | Heavier data model than finance needs                                                                                                        |
| **Yjs / Loro**              | CRDT libraries (Yjs most adopted; Loro newest) aimed at documents, text, trees                                                                | Encrypt-the-updates is a known pattern; a Loro write-up says with E2EE the server should just be a relay                                      | Document-oriented; we have mostly records                                                                                                    |
| **cr-sqlite** (MIT)         | SQLite extension adding per-column CRDT merge (LWW etc.) via a `crsql_changes` table; WASM build exists                                       | No built-in encryption; transport is yours. README warns `main` may be unstable; inserts ~2.5x slower; alter-table workarounds                | Good merge model, you own sync, crypto, relay                                                                                                |
| **Custom encrypted op log** | Each device appends encrypted, timestamped operations (hybrid logical clock); last-write-wins per record field; relay stores and serves blobs | Whatever we build                                                                                                                             | Finance data is record-shaped, so LWW per field is enough; full control of relay on Cloudflare, but we own the correctness and crypto design |
| Jazz                        | Toolkit with websocket protocol and IndexedDB/SQLite                                                                                          | Not found in sources                                                                                                                          | Not evaluated further                                                                                                                        |

## Evolu in detail (from its relay and privacy docs)

- **Relay**: reference relay ships as Docker image `evoluhq/relay` and npm `@evolu/relay`; needs SQLite and WebSockets; optional per-owner byte quota (`EVOLU_RELAY_MAX_OWNER_BYTES`). **Cloudflare Durable Objects is not an official target**; the docs say an adapter "could" be written. This conflicts with the earlier choice of an all-Cloudflare free-tier relay.
- **What the relay sees**: OwnerId, change timestamps, a random NodeId that links all owners one database writes to, approximate size (padded to within 12%), the write key, and IP addresses on connection. Content stays encrypted. Keys never go to relays.
- **Known gaps (their own list)**: no access control (anyone who knows an OwnerId can download its encrypted changes, so private relays are advised); write keys cannot be rotated or revoked and a key holder can use up quota or poison sync; removing a collaborator means moving data to a new owner; owner deletion not implemented; activity timing leaks through timestamps; secret strength matters because keys derive from the owner secret.
- **Platforms**: web (React, Svelte, Vue PWA examples), React Native; SQLite-WASM in browser; Electron mentioned in privacy docs. Repo shows no explicit version or maturity label; setup requires downloading a pinned wasm binary.
- **Unverified**: mnemonic length (the owners docs page was not found), exact merge model (last-write-wins per column is likely but not confirmed), Expo/Angular support, history growth and compaction.

## Findings that matter for the spec

- A blind relay is feasible with several designs; no option gives the exact "pair via QR, sync forever, all Cloudflare free tier" for free. Evolu gives the crypto and sync but not the Cloudflare hosting; a custom op log gives the hosting fit but we carry correctness and crypto.
- Finance data (accounts, transactions, categories) is record-shaped. Per-field last-write-wins with hybrid logical clocks, tombstones for deletes, and computed balances (never stored, always derived) avoids most hard CRDT cases. Rich-text and ordered-list CRDTs are not needed.
- Relay access control and abuse need our own design in every option (signed requests per device, per-space quotas, Turnstile at creation). Evolu's documented weakness here is a warning, not a solved problem.
- Metadata leaks (timestamps, activity timing, sizes, NodeId linkage) should be stated honestly in the spec's privacy section.
- History growth and compaction must be designed: logs grow forever unless snapshotted.

## Open question this surfaces

Adopt Evolu (and host its relay somewhere that runs Node/Docker, or build a Cloudflare adapter) versus build a custom encrypted op log on Workers/D1. See the follow-up grilling ticket on the map.

## Sources

- Evolu docs: https://www.evolu.dev/docs
- Evolu relay: https://www.evolu.dev/docs/relay
- Evolu privacy: https://www.evolu.dev/docs/privacy
- Evolu repo: https://github.com/evoluhq/evolu
- Automerge docs: https://automerge.org/docs/hello/
- cr-sqlite: https://github.com/vlcn-io/cr-sqlite
- Loro, "CRDTs are not enough": https://loro.dev/blog/crdt-is-not-enough
- CRDT library comparison (secondary): https://www.pkgpulse.com/guides/yjs-vs-automerge-vs-loro-crdt-libraries-2026
