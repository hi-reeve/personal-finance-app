# Client storage and desktop wrapper options

Researched 2026-10-14 from SQLite WASM, MDN, WebKit, Tauri, Electron and Capacitor docs. Nothing prototyped. Not researched: React Native, IndexedDB-based stores in depth.

## Browser/PWA database

| Option | Needs | Notes |
| --- | --- | --- |
| SQLite WASM + **OPFS VFS** | Worker thread, `SharedArrayBuffer` so COOP/COEP headers; Safari 17+ (earlier Safari broken by a WebKit bug) | A second tab opening the same DB hits locking errors; handle `SQLITE_BUSY` |
| SQLite WASM + **OPFS SAHPool VFS** | Worker; works on all major browsers since March 2023; **no COOP/COEP** | Best OPFS performance; no concurrent connections to the same DB across contexts; **wipes storage if initialization fails** unless `preserveOnInitFailure` (3.54+) is set |
| SQLite WASM + kvvfs (localStorage) | main thread only | ~5 MB limit; not viable |
| IndexedDB | none | Not researched here; Evolu's browser stack uses SQLite WASM, not raw IndexedDB |

Caveats from the SQLite docs: external causes (virus scanners, cleaners, permission changes, browser cleanup) can remove OPFS data; quota errors surface as generic I/O errors; incognito may have low or no persistence; WAL mode forces exclusive locking.

## Will the data survive?

- Default storage is **best-effort**: the browser may evict whole origins (all-or-nothing, least-recently-used first) under pressure. `navigator.storage.persist()` upgrades to persistent: Firefox prompts, Chromium and Safari decide silently from interaction history and heuristics (e.g. whether the site is a Home Screen app).
- **Safari**: script-writable storage (IndexedDB, localStorage, service worker data) is deleted after **seven days of Safari use without user interaction on the site**. **Web apps added to the Home Screen are exempt**: they keep their own usage counter and WebKit says it does not expect their first-party data to be deleted (WebKit blog, 2020). MDN and the WebKit 2023 storage post do not repeat the exemption, so re-verify against current Safari behavior.
- Quotas are generous (Chromium up to 60% of disk, Safari 17+ ~60% for browser apps) but are computed from total disk, not free space.
- Private browsing: lower quotas, data deleted at session end.

## Implications for the spec

- A browser tab on iOS is not a safe home for sole-copy data. The PWA must push users to **Add to Home Screen**, call `persist()`, show a storage-health indicator, and never be the only copy: sync, encrypted export, and the 24-word recovery are load-bearing, not extras.
- App start should detect "was initialized before but database is now empty" and offer restore from sync or backup rather than silently starting fresh.
- Choosing SAHPool avoids the COOP/COEP header constraint but is single-connection; choosing OPFS VFS or PaddleOCR threads/WebGPU (see OCR research) needs cross-origin isolation. Decide headers once for the whole app.
- Define one **storage interface** with implementations per runtime, so web, desktop and later native can differ underneath.

## Desktop wrapper

| | Tauri 2 | Electron |
| --- | --- | --- |
| Engine | System webview: WebView2 (Chromium) on Windows, WKWebView on macOS, WebKitGTK on Linux; Android system WebView; WKWebView on iOS | Bundles Chromium and Node.js |
| Size | Minimal app claimed under 600 KB | Not stated; known to be large because it ships a browser |
| Consistency | Engine and version vary by OS and distro; unsupported macOS versions get no WebKit updates; Linux table incomplete | Same engine everywhere |
| Backend | Rust, with `invoke` from JS | Node.js |
| Mobile | Docs say it targets desktop and mobile | Desktop only |
| Security | Rust base, audits for major/minor releases | Page links a security checklist, not summarized |

- Unverified: whether SQLite WASM OPFS (both VFSes) works in WKWebView and WebKitGTK under Tauri, and how it behaves on older macOS. On desktop, a native SQLite via Rust or Node avoids the question but splits the storage layer from the web build.
- Evolu's privacy docs mention SQLCipher on web and Electron, which favors Electron if Evolu is adopted.

## Native mobile later

- **Capacitor** wraps the web app in a native container ("if it works in the browser, it probably works in a mobile app"); plugins in Swift/Java. Fastest path, but still a webview, which may not satisfy a native feel.
- **Tauri mobile** exists per the docs; **React Native** would share logic but not UI. Neither deeply researched. This is a later decision; the storage interface and shared domain logic keep the options open.

## Open decisions (see map fog)

Desktop wrapper (Tauri vs Electron) depends on the sync architecture choice and a webview spike. Native mobile approach is deferred.

## Sources

- SQLite WASM persistence: https://sqlite.org/wasm/doc/trunk/persistence.md
- MDN storage quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- WebKit storage policy (2023): https://webkit.org/blog/14403/updates-to-storage-policy/
- WebKit ITP 7-day cap and Home Screen exemption (2020): https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Tauri 2: https://v2.tauri.app/start/
- Tauri webview versions: https://v2.tauri.app/reference/webview-versions/
- Electron: https://www.electronjs.org/docs/latest/
- Capacitor: https://capacitorjs.com/docs
