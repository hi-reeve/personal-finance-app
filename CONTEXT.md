# Personal finance app

A privacy-first, local-first personal finance app. Core job: see where money goes. This file is the shared glossary. Use these terms exactly; do not drift to the synonyms listed under _Avoid_.

## Language

**Space**: One user's synced data set and its relay storage. Identified by a space ID derived from the 24-word secret. Not a login account.
_Avoid_: workspace, tenant, user account

**Device**: One installed or opened copy of the app with its own signing key, registered into a Space at pairing.
_Avoid_: client (in user-facing text), session

**Account**: A place where money sits, with one currency, an opening balance, and a kind (cash, bank, e-wallet, credit card, other). Balance is computed, never stored. Archived rather than deleted once it has history. May be marked a **liability** (on by default for a credit card), and one Account can be the **default** that Add starts on.
_Avoid_: wallet, bank (as a general term)

**Balance adjustment**: A Transaction that corrects an Account's balance to match the bank, recorded in the reserved Balance adjustment Category. Reports ignore it.

**Transaction**: One payment or receipt on an Account, on a calendar date. Has one or more Lines. Its total is the sum of its Lines and is never stored.
_Avoid_: entry, payment

**Line**: One part of a Transaction with its own Category, amount, and optional item name. A plain purchase has one Line.
_Avoid_: item, split (as a noun for a Line), posting

**Split transaction**: A Transaction with more than one Line. Unrelated to Split bill, which divides a cost among people.

**Transfer**: One record moving money between two of the user's own Accounts, with a from leg, a to leg (each with its own amount and currency), and an optional fee. Not income or expense.
_Avoid_: two linked transactions

**Category**: A node in a tree of any depth, typed income or expense. One Category per Line. A merge that creates a cycle detaches the last-edited node to the top level.

**Tag**: A flat free label, many per Transaction.

**Person**: A name and optional note, shared by debts and Split bill. No phone number, no contact link.

**Attachment**: A receipt photo or PDF owned by a Transaction. Full file in R2, encrypted thumbnail synced eagerly.

**Base currency**: The home currency chosen at setup and locked once Transactions exist. Every Transaction stores its rate to it, frozen at the Transaction date.

**Display currency**: The currency a report is shown in. A display choice only; never changes stored data.

**Original amount**: Optional display-only amount and currency recorded on a Transaction (for example USD 12 paid on an IDR card). Reports never use it.

**Draft**: A Transaction prefilled by on-device OCR from a receipt, shown for mandatory review before saving.

**Home view**: One of three layouts of the Home dashboard (Summary, Overview, Categories). A device-local choice; all views read the same report engine, so a view never changes a number.

**Budget period**: The span a budget counts over: a month (from a start day shared by all budgets, 1 to 28), a week (Monday to Sunday) or a calendar year. A budget and the budgets above and inside its Category share one period.

**Overall budget**: An optional limit on all spending, independent of the Category budgets. The _unallocated_ amount is what it leaves after the top-level Category budgets of the same period.

**Carry-over**: Optional per budget. What a past period left unspent is added to the next one and overspending is taken off it. Computed from Transactions each time, never stored, and never reaches back before the budget was set.

**Threshold crossing**: The output saying a budget moved to _near_ or _over_ in a period. The save warning is one consumer; notifications can be another.

**Recurring item**: A template for something that repeats (a bill, a salary, a standing transfer): kind, Account, Category, amount and a schedule. Occurrences are worked out from it and never stored until acted on.

**Occurrence**: One due date of a Recurring item: upcoming, due soon, overdue, paid or skipped. Only paid and skipped ones are stored, under an id made from the item and the due date. It counts toward budgets and reports only once a real Transaction or Transfer pays it.

## Record rules

- IDs are UUIDv7, generated on the device.
- Calendar fields (`date`, optional `time`) are plain text `YYYY-MM-DD` and `HH:mm`, with no time-zone conversion.
- Machine timestamps (`created_at`, `updated_at`, sync clock) are epoch milliseconds in UTC and never drive reports.
- Deletes are tombstones. A record pointing at a deleted or missing record shows a placeholder instead of failing.
- The exchange-rate cache is device-local and never synced.
