---
"@pfa/core": minor
"@pfa/web": minor
---

Keep the op log in SQLite on the browser's private file system so records survive reloads. Core now ships a shared storage contract test that every store must pass. The app asks the browser for persistent storage and records the answer, shown under Settings.
