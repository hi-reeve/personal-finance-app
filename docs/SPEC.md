# Personal finance app: product spec (v1)

A privacy-first, local-first personal finance app. Core job: see where money goes. Runs as an installable web app (PWA), a Tauri desktop app, and native iOS and Android apps, all in v1.

This file gathers the decisions made on the wayfinder map (issue #1) so build sessions have one place to start. It does not restate the detail: each section names the ticket that holds it. **If this file and a ticket disagree, the ticket wins.** Terms follow [`CONTEXT.md`](../CONTEXT.md). Research notes are in [`docs/research/`](./research/).

Ticket links: `https://github.com/hi-reeve/personal-finance-app/issues/<n>`.

## 1. Principles

- **Local-first.** Everything works offline on the device. Sync is a transport added to a local op log, never a requirement.
- **Privacy-first.** No login, no email. Identity is a sync space plus device keys, rooted in one 24-word secret. The relay stores only ciphertext.
- **Free-tier hosting.** The relay runs on Cloudflare's free tier (hard rule). The owner carries the cost; no monetization for now.
- **Mobile-first, same design everywhere.** One own design language across PWA, desktop and native.
- **Plan before build.** Deferred decisions live in section 12 (fog) and are resolved during the build.
- Multi-currency from day one. Languages: Indonesian and English.

## 2. Platforms and architecture

| Platform      | Technology                                                      | Notes                                                 |
| ------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Web / PWA     | TanStack Start in SPA mode, React, TypeScript, Tailwind, Ark UI | Fully offline; receipt scanning hidden here           |
| Desktop       | Tauri shell loading the web build                               | Engine varies by OS (WebView2, WKWebView, WebKitGTK)  |
| iOS / Android | React Native with Expo                                          | TestFlight only for now; Android kept compiling in CI |
| Relay         | Cloudflare Workers + one SQLite Durable Object per space + R2   | Dumb, append-only, never sees plaintext               |

Monorepo with a platform-free `core` package (data model, op log, merge and sync client, reports, budgets, recurring, debts, split-bill maths, CSV mapper, receipt parser, money and rates, i18n messages). Platform differences enter through injected adapters: storage, crypto, clock, random, network.

Tickets: [Native mobile app approach for v1](https://github.com/hi-reeve/personal-finance-app/issues/23), [Research: client storage and desktop wrapper options](https://github.com/hi-reeve/personal-finance-app/issues/6), [Research: Cloudflare free-tier fit for the sync relay](https://github.com/hi-reeve/personal-finance-app/issues/2).

## 3. Repo, tooling and process

Ticket: [Repo, tooling and project structure for the monorepo](https://github.com/hi-reeve/personal-finance-app/issues/24).

- **Toolchain:** Vite+ (Vite, Vitest, Oxlint, Oxfmt, task runner). Mobile builds with Metro and Expo's CLI. pnpm underneath is an assumption to confirm in the spike.
- **Layout:** `apps/{web,desktop,mobile,relay}`, `packages/{core,protocol,tokens,config}`.
- **Import rules:** `core` and `protocol` import only each other and plain libraries; apps import `core`, `tokens`, `protocol` and never each other; `relay` imports `protocol` only. Enforced by package dependencies, TypeScript settings (`lib: ["ES2022"]`, `types: []`) and Oxlint restricted imports.
- **No `Intl` anywhere in `core`.** date-fns for dates, Dinero.js for money with a custom formatter (own tests per locale).
- **Tests:** Vitest on Node; Vitest with the Workers pool for the relay; a Hermes smoke run of `core`; Jest with `jest-expo` in `apps/mobile` only; Playwright (web), Maestro (mobile), desktop smoke test, multi-device sync convergence test.
- **Git:** Husky, lint-staged, commitlint (Conventional Commits, scopes = package names), gitleaks. Branches `type-description`. PRs for everything, squash merge, no direct push to `main`, required checks.
- **Releases:** Changesets, nothing published to npm. Every PR has a changeset (`changeset --empty` if no release impact). Each app has its own version and per-package tags (`web@1.4.0`). The sync **protocol version** is separate.
- **CI/CD:** GitHub Actions. Every PR runs lint, typecheck, tests, builds and a Metro export; per-app release tags trigger deploys (Cloudflare for web and relay, EAS to TestFlight, Tauri builds); weekly full native builds and end-to-end suites.
- **Dev environment:** pinned Node and pnpm, Expo development builds (not Expo Go), `wrangler dev` for the relay, `.env.example` per app, gitleaks guarding `docs/samples-private/`.

## 4. Data model

Ticket: [Data model: accounts, transactions, categories, tags, currency](https://github.com/hi-reeve/personal-finance-app/issues/7). Glossary: `CONTEXT.md`.

- Entities: Account, Transaction, Line, Transfer, Category, Tag, Person, Attachment, Settings. All records carry a UUIDv7 `id`, `created_at`, `updated_at`, and a tombstone `deleted_at`.
- A Transaction has one or more Lines; its total is derived, never stored. Each Line has one Category and an optional item name.
- A Transfer is one record with two legs (own account, amount, currency each) and an optional fee. Excluded from income and expense.
- Amounts are stored in the account's currency plus a frozen rate and base amount at the transaction date. Base currency is locked once transactions exist. Optional display-only original amount.
- Categories: tree of any depth, typed income or expense. Tags are flat.
- Dates are plain text `YYYY-MM-DD` and `HH:mm`, no time-zone conversion. Machine timestamps are epoch ms UTC and never drive reports.
- Accounts: five fixed kinds, unlimited; balance computed from an opening balance, transactions and transfer legs; archived rather than deleted once they have history.
- A Transaction paid by someone else may have no account (funded by an "I owe" debt).
- Referential rule: a missing or deleted target shows a placeholder, never a crash.

## 5. Sync, identity and recovery

Tickets: [Sync architecture: adopt Evolu or build a custom encrypted op log](https://github.com/hi-reeve/personal-finance-app/issues/20), [Recovery and pairing UX](https://github.com/hi-reeve/personal-finance-app/issues/14), [Research: local-first sync and CRDT options for E2EE](https://github.com/hi-reeve/personal-finance-app/issues/5).

- **Custom encrypted op log** (not Evolu). Per-field last-write-wins with hybrid logical clocks; deletes are tombstones; no compaction in v1.
- **Crypto:** 24-word BIP39 secret, HKDF to separate keys, XChaCha20-Poly1305 (libsodium), per-device Ed25519 signing keys, ops padded to size buckets. The plaintext envelope holds space ID, device ID, sequence number, protocol version and ciphertext only.
- **Relay limits:** open space creation with Turnstile, per-space quotas, a global circuit breaker near 70% of the free-tier daily limit. Empty spaces expire after 7 days, idle spaces after 30; the client re-seeds a missing space from local data and warns from day 20.
- **Protocol-version gate:** the relay stores a minimum version per space; outdated clients get a blocking "update required" screen and stay read-only with export.
- **First run is local-only.** Turning sync on generates the 24 words and checks three of them before the relay space is created. The banner escalates but never locks the user out.
- **Joining:** pair with another device (QR or one-time code, approval on the old device) or restore with the 24 words.
- **App lock:** optional per device (PIN plus biometric); an app lock, not disk encryption.
- **Encrypted export:** passphrase (Argon2id) plus XChaCha20-Poly1305; the only export that restores everything including photos.
- Seven key-loss scenarios and the single-device warning are specified in the recovery ticket. Plainly stated: lose all devices, the words and any export, and the data is gone.
- **What the relay can see:** space ID, device public keys and count, bucketed sizes, timestamps, IP address. Not amounts, merchants, categories, account names or receipt contents.
- **Receipt photos:** compressed (~1,600px, ~200 KB), encrypted thumbnail synced eagerly, full photo to R2 on demand, per-space quota, warn never delete.

## 6. Money features

### Budgets

Ticket: [Budgets design](https://github.com/hi-reeve/personal-finance-app/issues/8). Per-category budgets that roll up the tree, plus an optional overall budget. Monthly with a custom start day, optional weekly and yearly; budgets in one tree share a period. Optional carry-over. In-app warnings only (on track, near limit at 80%, over); never blocking. Base currency only. Upcoming bills show as "expected", not counted.

### Recurring and bills

Ticket: [Recurring and bills design](https://github.com/hi-reeve/personal-finance-app/issues/9). A recurring item is a template; occurrences are computed and become records only when paid or skipped (deterministic ID from item and due date). Every N days, weeks, months or years. States: upcoming, due soon, overdue, paid, skipped. Subscription flag with pause and end; price changes by effective date. Expense, income and transfer kinds. Expected versus paid is shown on the bill.

### Debts and loans

Ticket: [Debt and loan tracking design](https://github.com/hi-reeve/personal-finance-app/issues/10). One debt record (I owe / owed to me), balance computed. Debt-linked Lines are principal and excluded from income and expense; interest and fees go on normal Lines. Cicilan = debt plus a recurring item; the app never computes interest. Written off and settled states. "I owe" and "owed to me" are never netted by default.

### Split bill

Ticket: [Split bill design](https://github.com/hi-reeve/personal-finance-app/issues/11). Payer chosen per bill; equal, by item and by amount shares, mixable; proportional extras with exact rounding; four-step flow. A "Track what people owe me" toggle (default on) creates debts, off is "my treat". Read-only live share link with the key in the URL fragment, 30-day expiry with revoke and extend. Contact exchange (QR, code, link, approved requests) is in scope; friend approval of a bill is not.

### Contact mailbox

Ticket: [Contact mailbox: delivering split bills between app users](https://github.com/hi-reeve/personal-finance-app/issues/22). One inbox Durable Object per person; public request address plus a fresh private address per contact direction; send tokens so the relay never learns the sender; three message types, no free text; padded, 30-day retention, tight caps; contacts restore from the 24 words.

### Reports and export

Ticket: [Reports and export design](https://github.com/hi-reeve/personal-finance-app/issues/12). Five presets on one engine (spending by category, income vs expense, trends, merchants and tags, account and debt summary) with tweak-and-save. Currency views: as recorded (default) and at today's rate, plus an optional display currency. Exports: CSV (one row per Line), Excel, PDF, encrypted full backup. Net worth is derived from account balances and debts and ships here.

### Dashboard

Ticket: [Prototype: dashboard 'where my money goes'](https://github.com/hi-reeve/personal-finance-app/issues/15). One Home with three views (Summary, Overview, Categories) behind a segmented control; default by screen size then remembered per device. All read the same report engine. Every chart has a table alternative and a text summary.

### Notifications

Ticket: [Notification mechanism for budget and bill reminders](https://github.com/hi-reeve/personal-finance-app/issues/21), plus the native changes in the native mobile ticket. Local scheduled reminders where the platform allows (desktop, native, with a rolling window of 64 on iOS); an opt-in wake-up push for the PWA that shares reminder times only. Budget alerts stay in-app. Generic text by default; amounts never appear in a notification.

## 7. Design system and UX

Tickets: [Design system and UX principles](https://github.com/hi-reeve/personal-finance-app/issues/13), [Prototype: mobile-first navigation](https://github.com/hi-reeve/personal-finance-app/issues/16).

- Calm, clear, modern. Warm beige canvas, terracotta default accent with selectable alternatives, light/dark/system, colorblind-safe preset.
- Navigation: phone bottom bar (Home, Activity, raised Add, Plan, More); tablet icon rail with labels; desktop grouped sidebar. Add is a floating button on tablet and desktop, never inside a sidebar.
- Amounts in lists are plain ink with a +/− sign and an icon; income green and a cooler crimson for expense appear in charts, totals and cards; danger is a filled badge reserved for things needing action.
- WCAG 2.2 AA in both themes, 44px targets, reduced motion honored. One-tap hide-amounts through a single shared amount component.
- Paraglide for i18n (language is a setting, not a URL). Language and number/date format are independent settings.

## 8. Importing and receipts

- **CSV import:** generic column mapper with saved per-account presets; the two documented BCA layouts ship labelled "from documentation, untested"; duplicate detection and a shared review screen. Ticket: [Research: Indonesian bank CSV export formats](https://github.com/hi-reeve/personal-finance-app/issues/3).
- **Receipt scanning** (hidden on web): PaddleOCR on desktop, ML Kit on native (checked on the 14 receipts on a real phone first; PaddleOCR via ONNX as fallback). The parser needs row grouping, unit-price and discount handling, dot/comma thousands detection, Indonesian keywords, and arithmetic reconciliation on a mandatory review screen. Benchmark: PaddleOCR 100% totals and 98% line items vs Tesseract 71% and 47%. Phone browser speed was 3.6 minutes per image, hence hidden on web. Tickets: [Task: gather real receipt photos and benchmark OCR engines](https://github.com/hi-reeve/personal-finance-app/issues/19), [Research: on-device OCR for Indonesian receipts](https://github.com/hi-reeve/personal-finance-app/issues/4), `docs/research/on-device-ocr.md`.

## 9. Native-only features in v1

Biometric lock (key in Keychain or Keystore), contacts picker, share sheet, deep links, camera and photo picker, document picker, QR scanner, SQLCipher with a random key held this-device-only. Not in v1: widgets, Apple Watch, Siri. Ticket: [Native mobile app approach for v1](https://github.com/hi-reeve/personal-finance-app/issues/23).

## 10. Build order

Ticket: [v1 build order](https://github.com/hi-reeve/personal-finance-app/issues/17).

1. **Foundations:** repo, tooling, CI, `core` skeleton, design tokens, component libraries, shells, i18n, dark mode, hide-amounts, charts library per platform, and the spikes listed in section 12.
2. **Web, all money features:** transaction core, dashboard with charts, budgets, recurring and bills, debts.
3. **Native, the same set:** iOS on TestFlight first, then Android, plus native-only features.
4. **Sync and recovery** with the Tauri desktop shell.

**MVP = milestones 1 to 4.** After the MVP each feature ships on web, native and desktop together: 5 split bill, 6 contact mailbox, 7 reports and export, 8 CSV import, 9 receipt scanning. Anything that needs the relay comes after sync.

## 11. Out of scope

Investments and savings goals; bank sync; monetization; widgets, Apple Watch and Siri; split bill friend approval; customizable dashboard widgets; free-form report pivots; compaction and key rotation (later).

## 12. Not yet specified (resolve during the build)

Kept in the map's **Not yet specified** section (issue #1). In short:

- Real bank samples for import parsers; auto-categorization and multi-country banks (after v1).
- Local database encryption at rest for web and desktop.
- Receipt types beyond the 14 restaurant receipts; photo storage limits.
- Icon set, motion and haptics.
- **Foundations spikes:** Vite+ with Expo/Metro and pnpm, Oxlint coverage for React Native, Vitest on React Native, the Dinero formatter per locale, desktop auto-updater and macOS notarization, Apple/EAS signing in CI; TanStack Start SPA + Tauri + service worker together; SQLite on OPFS in macOS and Linux webviews; libsodium WASM; WebAuthn; Argon2id speed on phones; Durable Object cost, hibernation and rate limits; Turnstile in the PWA; push credentials; ML Kit accuracy; deep links; SQLCipher with `expo-sqlite`; `core` on Hermes; Excel library and PDF generation; Tauri closed-app notifications; iOS web push behaviour.
