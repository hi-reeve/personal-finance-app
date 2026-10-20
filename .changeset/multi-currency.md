---
"@pfa/core": minor
"@pfa/web": minor
---

Record Transactions in other currencies. Each keeps the exchange rate from its own day, fetched from
Frankfurter (api.frankfurter.dev) with jsDelivr's currency-api behind it, asking only for the day and
the two currencies, remembered on this device only, and always overridable
by hand when offline. An optional original amount is kept for display. Past amounts never change
when rates move.
