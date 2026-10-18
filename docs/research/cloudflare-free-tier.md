# Cloudflare free-tier fit for the sync relay

Researched 2026-10-14 from Cloudflare developer docs (Workers limits, D1 limits and pricing, R2 pricing, Durable Objects pricing, Turnstile plans). Limits change; recheck before building.

## Limits that matter (Free plan)

| Service | Limit |
| --- | --- |
| Workers | 100,000 requests/day (resets 00:00 UTC); 10 ms CPU per request; 50 subrequests; 128 MB memory; 100 Workers/account |
| D1 | 5M rows read/day; 100,000 rows written/day; 500 MB per database; 5 GB per account; 10 databases; 2 MB max row/blob |
| R2 (Standard) | 10 GB-month storage; 1M Class A ops/month (writes, lists); 10M Class B ops/month (reads); egress free |
| Durable Objects | SQLite-backed only on Free; 100,000 requests/day; 13,000 GB-s/day; 5M rows read/day; 100,000 rows written/day; 5 GB total |
| DO WebSockets | connection counts as 1 request; incoming messages bill at 20 messages = 1 request; outgoing free; hibernation avoids duration charges |
| Turnstile | Free, unlimited verifications, 20 widgets, 10 hostnames/widget |

Over a daily limit, operations fail until reset (Workers: error 1027; D1: queries blocked). There is no surprise bill on Free; the cost is downtime.

## Fit by relay job

- **Encrypted change push/pull**: fits. Encryption is client-side, so server CPU is I/O only; 10 ms is enough. Change batches are small, far under the 2 MB row limit.
- **Receipt photo blobs**: use R2, not D1. At ~300 KB compressed, 10 GB is about 33,000 photos across all users. Class A budget (1M/month) is not the constraint.
- **Live-update split-bill links**: a Worker GET returns the encrypted blob. Each viewer load costs requests; fine for personal use.
- **Live push**: DO WebSockets with hibernation are cheaper than client polling (20 messages per billed request). Polling every 30 s from one open client is about 2,900 Worker requests/day. Optional, not required for v1: pull-on-open plus modest polling works.
- **Bot protection at space creation**: Turnstile is free.

## Rough capacity

Assume an active user makes ~100 relay requests/day and each push writes ~3 D1 rows (row plus index writes). Then:

- Workers 100k requests/day: about 1,000 daily active users.
- D1 100k rows written/day: about 30,000 pushes/day, similar order.
- D1 storage: 500 MB per database; 5 GB per account. Shard by sync space or use per-space Durable Objects if one database nears 500 MB.

For one owner plus friends this has large headroom. First limits hit, in order: Workers requests/day and D1 rows written/day (both ~100k/day), then R2 storage if receipt photos are heavy.

## Design implications for the spec

- Clients must back off and keep working locally when the relay returns limit errors. Local-first makes this graceful.
- Batch changes into one request and one write where possible; avoid extra indexes on hot tables.
- Per-space quotas (size, request rate) and Turnstile at space creation protect the shared free quota.
- Storage behind a small interface stays worthwhile; Workers Paid (about $5/month, from memory, unverified) removes these limits if real users arrive.

## Unverified

- Whether R2 needs a payment method on file even for free usage.
- Whether static asset requests (the PWA shell) are free and unmetered on Workers.
- Per-object Durable Object SQLite size limit.
- Current Workers Paid price.
