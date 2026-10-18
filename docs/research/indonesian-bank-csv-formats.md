# Indonesian bank statement export formats

Researched 2026-10-14. **Thin evidence.** No bank publishes a format spec; what follows comes from third-party parsers and help pages. Only BCA has a CSV layout I could read in detail. Treat everything else as unverified until real sample files are collected.

## Per bank

| Source                              | Format                                                                                                    | Confidence                                                                                 | Notes              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------ |
| BCA KlikBCA Individual ("Personal") | CSV                                                                                                       | Medium (from go-bankset docstrings, partial samples)                                       | See layout below   |
| BCA business/corporate ("Bisnis")   | CSV                                                                                                       | Medium                                                                                     | See layout below   |
| Bank Jago                           | PDF e-statement; per-pocket history download                                                              | Low-medium (help page via search snippet: PDF only; page itself returned 403 when fetched) | No CSV found       |
| Mandiri (Livin', Kopra)             | Kopra: statement report with user-selected columns, formats not listed; Livin': no CSV/Excel export found | Low                                                                                        | Kopra is corporate |
| BNI, BRI                            | Nothing found; third-party parser lists them as planned (PDF e-statement)                                 | Very low                                                                                   |                    |
| GoPay, OVO                          | No export format found                                                                                    | Very low                                                                                   |                    |

## BCA layouts (from go-bankset)

**Personal (KlikBCA Individual):** comma-delimited, values unquoted.

- Header rows as `key,=,value`: `Account No.` (value prefixed with an apostrophe), `Name`, `Currency` (e.g. `IDR`); blank line.
- Columns: `Date,Description,Branch,Amount,,Balance`; the unnamed column holds the `CR`/`DB` marker.
- Date: apostrophe-prefixed `DD/MM/YYYY`. Amount and balance: no thousands separators, dot decimal, two places (`108400.00`).
- Opening balance row: `Starting Balance,=,934539.96`.
- Only `CR` appears in the samples; the debit marker is undocumented.

**Bisnis (corporate):** comma-delimited, every value double-quoted.

- Header lines: `"No. rekening : ..."`, name, `"Periode : ..."`, `"Kode Mata Uang : Rp"`.
- Columns: `"Tanggal Transaksi","Keterangan","Cabang","Jumlah","Saldo"`.
- Date `DD/MM/YYYY`. Amount: comma thousands, dot decimal, `CR` suffix (`3,528,964.00 CR`). Balance has no marker.
- `"Saldo Awal : ..."` line appears after the first transaction in the sample.

The two BCA layouts differ in delimiter, quoting, number format, and where the CR/DB marker sits, so a single "BCA CSV" parser is not enough.

## What this means for the spec

- **Do not assume CSV exists.** Jago appears PDF-only; Mandiri, BNI, BRI and the e-wallets are unconfirmed. PDF parsing (and possibly screenshot/OCR import) may be needed for some banks, and the OCR research ticket becomes relevant to import too.
- **Pluggable parser per source and per layout**, each with a detect step (sniff header rows or columns) and a normalizer.
- **Normalized intermediate shape** (go-bankset's is a useful reference): statement (bank, account name/number, period, currency) containing transactions (date as ISO `YYYY-MM-DD`, optional time, description, signed amount in minor units with currency, balance, optional transaction ID, raw row kept for debugging).
- **Locale-safe number parsing**: dot-decimal with comma thousands in business BCA, none in personal BCA; some banks likely use Indonesian locale (comma decimal). Parse per layout, never by guess.
- **Dedupe and reconciliation**: running balance columns let imports be validated (opening balance + sum = closing). Use them for duplicate detection and completeness checks.
- **Import is client-side only**, consistent with the privacy design; no statement ever leaves the device.
- Start with the banks the owner actually uses, driven by real sample files.

## Unverified

- BCA debit marker value (assumed `DB`).
- Footer lines, encodings, and BOMs of any bank file.
- Everything for Mandiri, BNI, BRI, Jago CSV, GoPay, OVO.

## Sources

- go-bankset BCA parser docs: https://pkg.go.dev/github.com/kankburhan/go-bankset/banks/bca
- go-bankset overview: https://pkg.go.dev/github.com/kankburhan/go-bankset
- Odoo BCA import module (business BCA CSV, IDR only): https://apps.odoo.com/apps/modules/9.0/account_bank_statement_import_bca
- Jago e-statement help (via search result; page returned 403 to fetch): https://www.jago.com/en/syariah/support/faq/use-jago/pockets/download-e-statements-and-transaction-history
- GitHub topic list of statement parsers: https://github.com/topics/bank-statement-parser
