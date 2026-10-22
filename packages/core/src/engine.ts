import type { Clock, OpStore, Random } from "./adapters";
import { compareHlc, type Hlc } from "./hlc";
import { newUuidV7 } from "./ids";
import {
  BUDGET_PERIODS,
  budgetStateOf,
  budgetUsed,
  DEFAULT_NEAR_LIMIT,
  type Budget,
  type BudgetPeriod,
  type BudgetProgress,
  type BudgetStanding,
  type OverallBudget,
  type OverallBudgetProgress,
  type Standing,
} from "./budgets";
import { budgetPeriodOf, dayAfter, type Period } from "./periods";
import {
  DEFAULT_DUE_SOON_DAYS,
  RECURRING_KINDS,
  RECURRING_UNITS,
  dueDates,
  daysBetween,
  occurrenceId,
  openStatus,
  type MarkPaidOptions,
  type NewRecurring,
  type Occurrence,
  type OccurrenceQuery,
  type RecurringItem,
  type RecurringPatch,
} from "./recurring";
import type { Entity, Op, OpValue } from "./ops";
import {
  currencyCodes,
  dateFormats,
  type CurrencyCode,
  type DateFormat,
  type NumberFormat,
} from "./format";
import { convertMinor, normalizeRate } from "./rates";
import {
  categoryTotals,
  dailyTotals,
  monthlyTotals,
  spendingByCategory,
  type DailyTotals,
  type MonthlyTotals,
  type SpendingInput,
  type SpendingByCategory,
  type SpendingQuery,
} from "./reports";
import {
  assertAccountColor,
  assertAccountIcon,
  assertAccountKind,
  assertAmount,
  assertDate,
  assertTime,
  type AccountColor,
  type AccountIcon,
  type AccountKind,
} from "./validate";

/**
 * The Category every balance adjustment is recorded in. A fixed id so every device agrees on it;
 * the Categories feature seeds the matching record, and reports leave it out.
 */
export const BALANCE_ADJUSTMENT_CATEGORY = "balance-adjustment";

export interface Line {
  id: string;
  categoryId: string;
  /** Integer minor units of the Account's currency. */
  amount: number;
  itemName?: string;
}

export type CategoryKind = "income" | "expense";

/**
 * The stored amount for a typed magnitude: expenses are negative, income positive. Lines hold
 * signed minor units, so balances and reports add them up directly.
 */
export function signedAmount(kind: CategoryKind, magnitude: number): number {
  if (!Number.isSafeInteger(magnitude) || magnitude <= 0)
    throw new Error(`Invalid amount ${magnitude}: expected a positive whole number of minor units`);
  return kind === "expense" ? -magnitude : magnitude;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Absent for a top-level Category. */
  parentId?: string;
  /** Built in and fixed: the Balance adjustment Category. Not part of the editable tree. */
  system?: true;
  createdAt: number;
}

export interface NewCategory {
  name: string;
  kind: CategoryKind;
  parentId?: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface TransferFee {
  amount: number;
  categoryId: string;
  /** Rate to the base currency when the fee is charged in another currency. */
  rate?: string;
}

export interface BudgetOptions {
  period?: BudgetPeriod;
  carryOver?: boolean;
  /** The day the change is made, `YYYY-MM-DD`. Absent means the clock's day (UTC). */
  today?: string;
}

/** Money moved between two of the user's own Accounts. Not income or expense. */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  /** Calendar date, plain text `YYYY-MM-DD`. */
  date: string;
  time?: string;
  note?: string;
  /** Leaves the from Account, in its currency. Whole minor units above zero. */
  fromAmount: number;
  /** Arrives in the to Account, in its currency. Equals `fromAmount` when the currencies match. */
  toAmount: number;
  /** Charged to the from Account and recorded as spending in an expense Category. */
  fee?: TransferFee;
  createdAt: number;
}

export interface NewTransfer {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  time?: string;
  note?: string;
  fromAmount: number;
  toAmount: number;
  fee?: TransferFee;
}

/** `fee: null` removes the fee. An empty `time` or `note` clears it. */
export type TransferPatch = Partial<Omit<NewTransfer, "fee">> & {
  fee?: TransferFee | null;
};

export interface Transaction {
  id: string;
  accountId: string;
  /** Calendar date, plain text `YYYY-MM-DD`. */
  date: string;
  /** Optional wall-clock time, plain text `HH:mm`. */
  time?: string;
  payee?: string;
  note?: string;
  lines: Line[];
  /** Frozen rate to the base currency; absent for an Account in the base currency. */
  rate?: string;
  original?: OriginalAmount;
  /** Set on a Transfer's fee, which is changed through its Transfer. */
  transferId?: string;
  /** Tags on the Transaction, by id. Absent when there are none. */
  tagIds?: string[];
  /** Always the sum of the Lines; never stored. */
  total: number;
  /** Epoch ms (UTC) when it was recorded. Machine time: never drives reports. */
  createdAt: number;
  /** Epoch ms (UTC) of the latest change to the Transaction or any of its Lines. */
  updatedAt: number;
}

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  /** Integer minor units of the Account's currency. */
  openingBalance: number;
  icon?: AccountIcon;
  color?: AccountColor;
  /** Counts against the user in summaries. On by default for a credit card. */
  isLiability: boolean;
  /** Epoch ms (UTC) when it was archived; absent while it is in use. */
  archivedAt?: number;
  /** Epoch ms (UTC) when it was created. */
  createdAt: number;
}

export type NewAccount = Omit<Account, "id" | "createdAt" | "archivedAt" | "isLiability"> & {
  isLiability?: boolean;
};

/** What can change on an Account. Currency locks once the Account has Transactions. */
export type AccountPatch = Partial<Omit<NewAccount, "openingBalance" | "icon" | "color">> & {
  /** An empty string clears it. */
  icon?: AccountIcon | "";
  color?: AccountColor | "";
};

/** Synced settings. Empty until first-run setup completes. */
export interface Settings {
  baseCurrency?: CurrencyCode;
  /** Epoch ms (UTC) when setup finished. */
  setupAt?: number;
  /** The Account Add starts on. Absent when none is chosen or it was archived or deleted. */
  defaultAccountId?: string;
  /** How numbers are written, the same on every device. Absent until chosen: a device then uses its own locale. */
  numberFormat?: NumberFormat;
  dateFormat?: DateFormat;
  /** Percent of a budget at which it counts as near its limit. Absent means the default, 80. */
  budgetNearLimit?: number;
  /** The day a monthly budget period starts, 1 to 28. Absent means the 1st. */
  budgetStartDay?: number;
}

/** The synced preferences. Theme, accent, language and hide-amounts are per device and not here. */
export interface Preferences {
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
  /** A whole percent from 1 to 99. */
  budgetNearLimit: number;
  /** The day a monthly budget period starts, a whole number from 1 to 28. */
  budgetStartDay: number;
}

export interface NewLine {
  categoryId: string;
  amount: number;
  itemName?: string;
}

/** What was really paid, for display only: for example USD 12 on a card that is in rupiah. */
export interface OriginalAmount {
  amount: number;
  currency: CurrencyCode;
}

export interface NewTransaction {
  accountId: string;
  date: string;
  time?: string;
  payee?: string;
  note?: string;
  /**
   * Units of the base currency one whole unit of the Account's currency buys, as decimal text,
   * frozen with the Transaction. Required for an Account not in the base currency, and not allowed
   * for one that is.
   */
  rate?: string;
  original?: OriginalAmount;
  lines: NewLine[];
}

/** An empty `time` clears it; `original: null` removes the original amount. */
export type TransactionPatch = Partial<Omit<NewTransaction, "lines" | "original">> & {
  original?: OriginalAmount | null;
};

export type LinePatch = Partial<NewLine>;

/** One Line of an updated Transaction: with an `id` it changes that Line, without one it is new. */
export interface LineUpdate extends NewLine {
  id?: string;
}

export interface EngineOptions {
  deviceId: string;
  clock: Clock;
  random: Random;
  store: OpStore;
}

export interface Engine {
  recordTransaction(input: NewTransaction): Promise<Transaction>;
  editTransaction(id: string, patch: TransactionPatch): Promise<void>;
  editLine(transactionId: string, lineId: string, patch: LinePatch): Promise<void>;
  /**
   * Sets the header fields and the full list of Lines in one write: Lines with an id are changed,
   * Lines without one are added, and Lines left out are removed. An empty `itemName` clears it.
   * Either everything applies or nothing does.
   */
  updateTransaction(
    id: string,
    patch: TransactionPatch,
    lines: readonly LineUpdate[],
  ): Promise<Transaction>;
  /** Marks the Transaction deleted with a tombstone; history stays in the op log. */
  deleteTransaction(id: string): Promise<void>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  /** Changes the synced preferences in one write; anything not named stays as it is. */
  setPreferences(patch: Partial<Preferences>): Promise<void>;
  /** Synced settings as they stand now. */
  getSettings(): Settings;
  /**
   * First run: sets the base currency and creates the first Account in one write, so a crash cannot
   * leave one without the other. Refuses to run again once the base currency is set.
   */
  completeSetup(input: { baseCurrency: CurrencyCode; account: NewAccount }): Promise<Account>;
  createAccount(input: NewAccount): Promise<Account>;
  /** Accounts that were not deleted, archived ones included, oldest first. */
  listAccounts(): Promise<Account[]>;
  editAccount(id: string, patch: AccountPatch): Promise<Account>;
  /** Opening balance plus every live Transaction on the Account. */
  getBalance(accountId: string): Promise<number>;
  /**
   * Records a Transaction in the Balance adjustment Category that brings the balance to `target`,
   * so the books match the bank without rewriting history.
   */
  adjustBalance(accountId: string, input: { target: number; date: string }): Promise<Transaction>;
  /** Removes an Account with no history. An Account with history can only be archived. */
  deleteAccount(id: string): Promise<void>;
  archiveAccount(id: string): Promise<void>;
  unarchiveAccount(id: string): Promise<void>;
  /** Pass `undefined` to clear it. */
  setDefaultAccount(id: string | undefined): Promise<void>;
  createCategory(input: NewCategory): Promise<Category>;
  editCategory(id: string, patch: { name: string }): Promise<Category>;
  /** Move under another Category of the same kind, or to the top level with `undefined`. */
  moveCategory(id: string, parentId: string | undefined): Promise<void>;
  /**
   * Deletes a Category nothing uses; its children move up one level. A Category with Lines must be
   * merged into another instead, so nothing is orphaned.
   */
  deleteCategory(id: string): Promise<void>;
  /** Lines and children of `id` follow into `intoId`; `id` disappears. Same kind only. */
  mergeCategory(id: string, intoId: string): Promise<void>;
  /** A merged Category answers with the Category it became. */
  getCategory(id: string): Promise<Category | undefined>;
  /** Categories in creation order. A cycle from concurrent moves is broken. */
  listCategories(): Promise<Category[]>;
  /** Categories whose name contains `query` (any case), with the names from the top down to each. */
  searchCategories(
    query: string,
    options?: { kind?: CategoryKind },
  ): Promise<{ category: Category; path: string[] }[]>;
  /** Categories on the latest Transactions, newest first, each once. */
  recentCategories(limit: number): Promise<Category[]>;
  /** Returns the existing Tag when the name matches one in any case. */
  createTag(name: string): Promise<Tag>;
  renameTag(id: string, name: string): Promise<Tag>;
  deleteTag(id: string): Promise<void>;
  /** Tags in creation order. */
  listTags(): Promise<Tag[]>;
  tagTransaction(transactionId: string, tagId: string): Promise<void>;
  untagTransaction(transactionId: string, tagId: string): Promise<void>;
  recordTransfer(input: NewTransfer): Promise<Transfer>;
  /** Changes a Transfer and its fee in one write. */
  updateTransfer(id: string, patch: TransferPatch): Promise<Transfer>;
  /** Deletes the Transfer and its fee with tombstones. */
  deleteTransfer(id: string): Promise<void>;
  getTransfer(id: string): Promise<Transfer | undefined>;
  /** Live Transfers, oldest date first. */
  listTransfers(): Promise<Transfer[]>;
  /**
   * Each Line and the total in the base currency, converted at the Transaction's own frozen rate.
   * Absent when there is nothing to convert at: no base currency yet, or an old foreign Transaction
   * with no rate.
   */
  getBaseAmounts(transactionId: string): Promise<{ lines: number[]; total: number } | undefined>;
  /**
   * What was spent (or earned) in a period, by Category, with drill-down and shares, in the base
   * currency "as recorded". See `spendingByCategory` for the counting rules.
   */
  spendingByCategory(query: SpendingQuery): Promise<SpendingByCategory>;
  /** The same counting rules, day by day over the period. */
  dailyTotals(query: SpendingQuery): Promise<DailyTotals>;
  /**
   * Sets the budget on an expense Category, or changes it. One per Category. A new budget is monthly
   * with no carry-over unless told otherwise; changing one keeps what is not named. A change of
   * amount applies from the period of `today` onward, so past periods keep the amount they had.
   * A budget must use the same period as the budgets above and inside its Category.
   */
  setBudget(categoryId: string, amount: number, options?: BudgetOptions): Promise<Budget>;
  removeBudget(categoryId: string): Promise<void>;
  /** The optional budget over all spending, whatever the Category budgets add up to. */
  setOverallBudget(amount: number, options?: BudgetOptions): Promise<OverallBudget>;
  removeOverallBudget(): Promise<void>;
  getOverallBudget(): Promise<OverallBudget | undefined>;
  /** Category budgets whose Category still exists, following merges. */
  listBudgets(): Promise<Budget[]>;
  /**
   * How each budget stands in the period that contains `on`. Carry-over is worked out from past
   * Transactions each time. A Transaction is never blocked by any of this.
   */
  budgetProgress(on: string): Promise<BudgetStanding>;
  /** Makes a template for something that repeats: a bill, a salary, a standing transfer. */
  createRecurring(input: NewRecurring): Promise<RecurringItem>;
  /** Changes future occurrences only: paid and skipped ones keep what they expected. */
  updateRecurring(id: string, patch: RecurringPatch): Promise<RecurringItem>;
  /** The Transactions and Transfers already made stay. */
  deleteRecurring(id: string): Promise<void>;
  listRecurring(): Promise<RecurringItem[]>;
  /**
   * Due dates worked out from the templates, each with where it stands. Without `from` only the
   * occurrences nobody acted on come back, overdue ones included: nothing disappears with time.
   */
  listOccurrences(query: OccurrenceQuery): Promise<Occurrence[]>;
  /**
   * Pays an occurrence: makes the Transaction or Transfer from the template (amount and date can
   * differ) and links it. Nothing counts toward budgets or reports before this.
   */
  markPaid(
    itemId: string,
    due: string,
    options?: MarkPaidOptions,
  ): Promise<{ transaction?: Transaction; transfer?: Transfer }>;
  /** Transactions and Transfers near a due date that fit the item, to link instead of paying. */
  linkCandidates(
    itemId: string,
    due: string,
    windowDays?: number,
  ): Promise<{ transactions: Transaction[]; transfers: Transfer[] }>;
  /** Counts an existing Transaction or Transfer as the payment. */
  linkOccurrence(
    itemId: string,
    due: string,
    target: { transactionId: string } | { transferId: string },
  ): Promise<void>;
  skipOccurrence(itemId: string, due: string): Promise<void>;
  /** Puts a skipped occurrence back among those to act on. */
  reopenOccurrence(itemId: string, due: string): Promise<void>;
  /** Skips every occurrence of the item before `before` that nobody acted on. Returns how many. */
  skipOlder(itemId: string, before: string): Promise<number>;
  /** Income and spending per calendar month across a range, for trends. */
  monthlyTotals(query: { from: string; to: string }): Promise<MonthlyTotals>;
  /** Live Transactions, oldest date first. A Transfer's fee is included; the Transfer is not. */
  listTransactions(): Promise<Transaction[]>;
  /** Every op this device holds, to send to another device. */
  exportOps(): Promise<Op[]>;
  /** Merge ops from another device. Safe to repeat and to deliver in any order. */
  applyOps(ops: readonly Op[]): Promise<void>;
}

type Fields = Map<string, { value: OpValue; hlc: Hlc }>;

const TRANSACTION_FIELDS = ["accountId", "date", "time", "payee", "note"] as const;
const LINE_FIELDS = ["categoryId", "amount", "itemName"] as const;
const ACCOUNT_FIELDS = ["name", "kind", "currency", "openingBalance", "icon", "color"] as const;
const TRANSFER_FIELDS = [
  "fromAccountId",
  "toAccountId",
  "date",
  "time",
  "note",
  "fromAmount",
  "toAmount",
] as const;
const SETTINGS_ID = "settings";
const isStartDay = (value: number) => Number.isInteger(value) && value >= 1 && value <= 28;
const isNearLimit = (value: number) => Number.isInteger(value) && value >= 1 && value <= 99;
const NUMBER_FORMATS: readonly NumberFormat[] = ["dot-comma", "comma-dot"];

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export async function createEngine(options: EngineOptions): Promise<Engine> {
  const { deviceId, clock, random, store } = options;
  const transactions = new Map<string, Fields>();
  const lines = new Map<string, Fields>();
  const lineIdsByTransaction = new Map<string, Set<string>>();
  const seen = new Set<string>();
  let last: Hlc = { wall: 0, counter: 0, device: deviceId };

  const accounts = new Map<string, Fields>();
  const settings = new Map<string, Fields>();
  const categories = new Map<string, Fields>();
  const tags = new Map<string, Fields>();
  const taggings = new Map<string, Fields>();
  const transfers = new Map<string, Fields>();
  const budgets = new Map<string, Fields>();
  const recurringItems = new Map<string, Fields>();
  const occurrences = new Map<string, Fields>();
  const tables: Record<Entity, Map<string, Fields>> = {
    transaction: transactions,
    line: lines,
    account: accounts,
    settings,
    category: categories,
    tag: tags,
    tagging: taggings,
    transfer: transfers,
    budget: budgets,
    recurring: recurringItems,
    occurrence: occurrences,
  };
  const table = (entity: Entity) => tables[entity];

  function fold(op: Op) {
    seen.add(op.id);
    // Anything local that is written later must order after every op already known.
    if (compareHlc(op.hlc, last) > 0)
      last = { wall: op.hlc.wall, counter: op.hlc.counter, device: deviceId };

    const records = table(op.entity);
    let fields = records.get(op.recordId);
    if (!fields) records.set(op.recordId, (fields = new Map()));
    const current = fields.get(op.field);
    if (current && compareHlc(op.hlc, current.hlc) <= 0) return;
    fields.set(op.field, { value: op.value, hlc: op.hlc });

    if (op.entity === "line" && op.field === "transactionId") {
      const owned = lineIdsByTransaction.get(String(op.value)) ?? new Set<string>();
      owned.add(op.recordId);
      lineIdsByTransaction.set(String(op.value), owned);
    }
  }

  for (const op of await store.readAll()) fold(op);

  function tick(): Hlc {
    const wall = Math.max(last.wall, clock.now());
    const counter = wall === last.wall ? last.counter + 1 : 0;
    return { wall, counter, device: deviceId };
  }

  function opsFor(
    entity: Entity,
    recordId: string,
    values: Record<string, OpValue | undefined>,
  ): Op[] {
    const out: Op[] = [];
    for (const [field, value] of Object.entries(values)) {
      if (value === undefined) continue;
      const hlc = tick();
      last = hlc;
      out.push({ id: newUuidV7(clock, random), hlc, entity, recordId, field, value });
    }
    return out;
  }

  async function commit(ops: readonly Op[]) {
    const fresh: Op[] = [];
    for (const op of ops) {
      if (seen.has(op.id)) continue;
      seen.add(op.id);
      fresh.push(op);
    }
    await store.append(fresh);
    for (const op of fresh) fold(op);
  }

  /** A deleted Transaction has a positive `deletedAt`; zero means it was brought back. */
  function isLive(id: string): boolean {
    const fields = transactions.get(id);
    if (fields === undefined || Number(fields.get("deletedAt")?.value ?? 0) > 0) return false;
    // A Transfer's fee goes with its Transfer, even when another device deleted the Transfer.
    const transferId = text(fields, "transferId");
    return !transferId || isLiveTransfer(transferId);
  }

  function assertLive(id: string) {
    if (!isLive(id)) throw new Error(`Transaction ${id} does not exist or was deleted`);
  }

  function text(fields: Fields, name: string): string | undefined {
    const value = fields.get(name)?.value;
    return value === undefined ? undefined : String(value);
  }

  /** Lines keep the order they were added in, which every device agrees on. */
  function lineOrder(a: string, b: string): number {
    return (
      compareHlc(
        lines.get(a)!.get("transactionId")!.hlc,
        lines.get(b)!.get("transactionId")!.hlc,
      ) || (a < b ? -1 : 1)
    );
  }

  function readLine(lineId: string): Line {
    const f = lines.get(lineId)!;
    const itemName = text(f, "itemName") || undefined;
    return {
      id: lineId,
      categoryId: resolveCategory(text(f, "categoryId")!),
      amount: Number(f.get("amount")!.value),
      ...(itemName !== undefined ? { itemName } : {}),
    };
  }

  function readTransaction(id: string): Transaction | undefined {
    if (!isLive(id)) return undefined;
    const f = transactions.get(id)!;
    const owned = [...(lineIdsByTransaction.get(id) ?? [])]
      .filter((lineId) => !lines.get(lineId)!.has("deletedAt"))
      .sort(lineOrder);
    const time = text(f, "time") || undefined;
    const payee = text(f, "payee") || undefined;
    const note = text(f, "note") || undefined;
    let updatedAt = 0;
    for (const fields of [f, ...owned.map((lineId) => lines.get(lineId)!)]) {
      for (const { hlc } of fields.values()) updatedAt = Math.max(updatedAt, hlc.wall);
    }
    const ownedLines = owned.map(readLine);
    const tagIds = tagsOn(id);
    const transferId = text(f, "transferId") || undefined;
    const rate = text(f, "rate") || undefined;
    const originalCurrency = text(f, "originalCurrency") as CurrencyCode | undefined;
    const originalAmount = Number(f.get("originalAmount")?.value ?? 0);
    return {
      id,
      accountId: text(f, "accountId")!,
      date: text(f, "date")!,
      ...(time !== undefined ? { time } : {}),
      ...(payee !== undefined ? { payee } : {}),
      ...(note !== undefined ? { note } : {}),
      lines: ownedLines,
      ...(rate !== undefined ? { rate } : {}),
      ...(originalCurrency && originalAmount > 0
        ? { original: { amount: originalAmount, currency: originalCurrency } }
        : {}),
      ...(transferId !== undefined ? { transferId } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
      total: ownedLines.reduce((sum, line) => sum + line.amount, 0),
      createdAt: Number(f.get("createdAt")!.value),
      updatedAt,
    };
  }

  function assertCurrency(code: string) {
    if (!currencyCodes.includes(code as CurrencyCode))
      throw new Error(`Unsupported currency "${code}"`);
  }

  function checkAccount(input: NewAccount): NewAccount {
    const name = input.name.trim();
    if (name === "") throw new Error("An Account needs a name");
    assertAccountKind(input.kind);
    assertCurrency(input.currency);
    assertAmount(input.openingBalance);
    if (input.icon !== undefined) assertAccountIcon(input.icon);
    if (input.color !== undefined) assertAccountColor(input.color);
    return { ...input, name };
  }

  function isLiveAccount(id: string): boolean {
    const fields = accounts.get(id);
    return fields !== undefined && !fields.has("deletedAt");
  }

  function assertAccount(id: string) {
    if (!isLiveAccount(id)) throw new Error(`Account ${id} does not exist or was deleted`);
  }

  function archivedAt(fields: Fields): number | undefined {
    const at = Number(fields.get("archivedAt")?.value ?? 0);
    return at > 0 ? at : undefined;
  }

  /** A Transaction may not be added to an Account known to be archived or deleted. */
  function assertOpenForTransactions(id: string) {
    const fields = accounts.get(id);
    if (fields === undefined) return;
    if (fields.has("deletedAt")) throw new Error(`Account ${id} was deleted`);
    if (archivedAt(fields) !== undefined) throw new Error(`Account ${id} is archived`);
  }

  function liveTransactionsOn(accountId: string): Transaction[] {
    return [...transactions.keys()].flatMap((id) => {
      const tx = readTransaction(id);
      return tx !== undefined && tx.accountId === accountId ? [tx] : [];
    });
  }

  function readAccount(id: string): Account {
    const f = accounts.get(id)!;
    const kind = text(f, "kind") as AccountKind;
    const icon = (text(f, "icon") || undefined) as AccountIcon | undefined;
    const color = (text(f, "color") || undefined) as AccountColor | undefined;
    const archived = archivedAt(f);
    const liability = f.get("isLiability")?.value;
    return {
      id,
      name: text(f, "name")!,
      kind,
      currency: text(f, "currency") as CurrencyCode,
      openingBalance: Number(f.get("openingBalance")!.value),
      ...(icon !== undefined ? { icon } : {}),
      ...(color !== undefined ? { color } : {}),
      isLiability: liability === undefined ? kind === "credit-card" : Number(liability) === 1,
      ...(archived !== undefined ? { archivedAt: archived } : {}),
      createdAt: Number(f.get("createdAt")!.value),
    };
  }

  function accountOps(input: NewAccount): { id: string; ops: Op[] } {
    const id = newUuidV7(clock, random);
    return {
      id,
      ops: opsFor("account", id, {
        ...pick(input, ACCOUNT_FIELDS),
        ...(input.isLiability !== undefined ? { isLiability: input.isLiability ? 1 : 0 } : {}),
        createdAt: clock.now(),
      }),
    };
  }

  function readSettings(): Settings {
    const f = settings.get(SETTINGS_ID);
    if (f === undefined) return {};
    const baseCurrency = text(f, "baseCurrency") as CurrencyCode | undefined;
    const setupAt = f.get("setupAt")?.value;
    const chosen = text(f, "defaultAccountId");
    const defaultOk =
      chosen !== undefined &&
      chosen !== "" &&
      isLiveAccount(chosen) &&
      archivedAt(accounts.get(chosen)!) === undefined;
    // A value this app does not know, from a newer app on another device, is ignored.
    const storedNumber = text(f, "numberFormat") as NumberFormat | undefined;
    const storedDate = text(f, "dateFormat") as DateFormat | undefined;
    const numberFormat =
      storedNumber !== undefined && NUMBER_FORMATS.includes(storedNumber)
        ? storedNumber
        : undefined;
    const dateFormat =
      storedDate !== undefined && dateFormats.includes(storedDate) ? storedDate : undefined;
    const storedNear = f.get("budgetNearLimit")?.value;
    const budgetNearLimit =
      storedNear !== undefined && isNearLimit(Number(storedNear)) ? Number(storedNear) : undefined;
    const storedStart = f.get("budgetStartDay")?.value;
    const budgetStartDay =
      storedStart !== undefined && isStartDay(Number(storedStart))
        ? Number(storedStart)
        : undefined;
    return {
      ...(baseCurrency !== undefined ? { baseCurrency } : {}),
      ...(setupAt !== undefined ? { setupAt: Number(setupAt) } : {}),
      ...(defaultOk ? { defaultAccountId: chosen } : {}),
      ...(numberFormat ? { numberFormat } : {}),
      ...(dateFormat ? { dateFormat } : {}),
      ...(budgetNearLimit !== undefined ? { budgetNearLimit } : {}),
      ...(budgetStartDay !== undefined ? { budgetStartDay } : {}),
    };
  }

  /** Follows merges to the Category an id has become. */
  function resolveCategory(id: string): string {
    const seenIds = new Set<string>();
    let current = id;
    for (;;) {
      const next = categories.get(current)?.get("mergedInto")?.value;
      if (next === undefined || seenIds.has(current)) return current;
      seenIds.add(current);
      current = String(next);
    }
  }

  function isLiveCategory(id: string): boolean {
    const f = categories.get(id);
    return f !== undefined && !f.has("deletedAt") && !f.has("mergedInto");
  }

  function assertCategory(id: string): void {
    if (id === BALANCE_ADJUSTMENT_CATEGORY)
      throw new Error("The Balance adjustment Category is built in");
    if (!isLiveCategory(id)) throw new Error(`Category ${id} does not exist or was deleted`);
  }

  function categoryKind(id: string): CategoryKind {
    return text(categories.get(id)!, "kind") as CategoryKind;
  }

  /** The newest change to any field of a record, as a total order for choosing who yields. */
  function lastEdited(fields: Fields): Hlc {
    let newest: Hlc | undefined;
    for (const { hlc } of fields.values()) if (!newest || compareHlc(hlc, newest) > 0) newest = hlc;
    return newest!;
  }

  function creationOrder(records: Map<string, Fields>) {
    return (a: string, b: string) =>
      compareHlc(records.get(a)!.get("createdAt")!.hlc, records.get(b)!.get("createdAt")!.hlc);
  }

  /** Each live Category's parent after merges, with any cycle broken the same way on every device. */
  function effectiveParents(): Map<string, string | undefined> {
    const parents = new Map<string, string | undefined>();
    for (const id of categories.keys()) {
      if (!isLiveCategory(id)) continue;
      const declared = text(categories.get(id)!, "parentId");
      const parent = declared ? resolveCategory(declared) : undefined;
      parents.set(id, parent !== undefined && isLiveCategory(parent) ? parent : undefined);
    }
    for (let broken = true; broken;) {
      broken = false;
      for (const id of parents.keys()) {
        const path: string[] = [];
        let current: string | undefined = id;
        while (current !== undefined && !path.includes(current)) {
          path.push(current);
          current = parents.get(current);
        }
        if (current === undefined) continue;
        const cycle = path.slice(path.indexOf(current));
        const last = cycle.reduce((best, next) => {
          const order = compareHlc(
            lastEdited(categories.get(next)!),
            lastEdited(categories.get(best)!),
          );
          return order > 0 || (order === 0 && next > best) ? next : best;
        });
        parents.set(last, undefined);
        broken = true;
        break;
      }
    }
    return parents;
  }

  function readCategory(id: string, parents: Map<string, string | undefined>): Category {
    const f = categories.get(id)!;
    const parentId = parents.get(id);
    return {
      id,
      name: text(f, "name")!,
      kind: categoryKind(id),
      ...(parentId !== undefined ? { parentId } : {}),
      createdAt: Number(f.get("createdAt")!.value),
    };
  }

  const BALANCE_ADJUSTMENT: Category = {
    id: BALANCE_ADJUSTMENT_CATEGORY,
    name: "Balance adjustment",
    kind: "expense",
    system: true,
    createdAt: 0,
  };

  function allCategories(): Category[] {
    const parents = effectiveParents();
    return [...parents.keys()]
      .sort(creationOrder(categories))
      .map((id) => readCategory(id, parents));
  }

  function pathOf(category: Category, byId: Map<string, Category>): string[] {
    const names: string[] = [];
    for (
      let at: Category | undefined = category;
      at;
      at = at.parentId ? byId.get(at.parentId) : undefined
    )
      names.unshift(at.name);
    return names;
  }

  function isInside(candidate: string, ancestor: string, parents: Map<string, string | undefined>) {
    for (let at: string | undefined = candidate; at !== undefined; at = parents.get(at))
      if (at === ancestor) return true;
    return false;
  }

  function checkName(name: string, what: string): string {
    const trimmed = name.trim();
    if (trimmed === "") throw new Error(`A ${what} needs a name`);
    return trimmed;
  }

  function liveTags(): string[] {
    return [...tags.keys()]
      .filter((id) => !tags.get(id)!.has("deletedAt"))
      .sort(creationOrder(tags));
  }

  function readTag(id: string): Tag {
    return { id, name: text(tags.get(id)!, "name")! };
  }

  function assertTag(id: string): void {
    const f = tags.get(id);
    if (f === undefined || f.has("deletedAt"))
      throw new Error(`Tag ${id} does not exist or was deleted`);
  }

  function tagsOn(transactionId: string): string[] {
    const out: string[] = [];
    for (const f of taggings.values()) {
      if (text(f, "transactionId") !== transactionId || Number(f.get("attached")?.value) !== 1)
        continue;
      const tagId = text(f, "tagId")!;
      if (tags.has(tagId) && !tags.get(tagId)!.has("deletedAt")) out.push(tagId);
    }
    return out.sort();
  }

  function setTagging(transactionId: string, tagId: string, attached: 0 | 1): Promise<void> {
    return commit(
      opsFor("tagging", `${transactionId}:${tagId}`, { transactionId, tagId, attached }),
    );
  }

  function isLiveTransfer(id: string): boolean {
    const f = transfers.get(id);
    return f !== undefined && !f.has("deletedAt");
  }

  function liveTransfers(): string[] {
    return [...transfers.keys()].filter(isLiveTransfer);
  }

  // The fee's ids come from its Transfer, so two devices that add a fee to the same Transfer write
  // to the same records and merge into one fee instead of charging twice.
  const feeIdOf = (transferId: string) => `fee-${transferId}`;
  const feeLineIdOf = (transferId: string) => `fee-line-${transferId}`;

  /** The live Transaction that records a Transfer's fee, if it has one. */
  function feeTransactionOf(transferId: string): string | undefined {
    const id = feeIdOf(transferId);
    return isLive(id) ? id : undefined;
  }

  function readTransfer(id: string): Transfer {
    const f = transfers.get(id)!;
    const time = text(f, "time") || undefined;
    const note = text(f, "note") || undefined;
    const feeId = feeTransactionOf(id);
    const feeTx = feeId !== undefined ? readTransaction(feeId) : undefined;
    const feeLine = feeTx?.lines[0];
    return {
      id,
      fromAccountId: text(f, "fromAccountId")!,
      toAccountId: text(f, "toAccountId")!,
      date: text(f, "date")!,
      ...(time !== undefined ? { time } : {}),
      ...(note !== undefined ? { note } : {}),
      fromAmount: Number(f.get("fromAmount")!.value),
      toAmount: Number(f.get("toAmount")!.value),
      ...(feeLine !== undefined
        ? {
            fee: {
              amount: -feeLine.amount,
              categoryId: feeLine.categoryId,
              ...(feeTx?.rate !== undefined ? { rate: feeTx.rate } : {}),
            },
          }
        : {}),
      createdAt: Number(f.get("createdAt")!.value),
    };
  }

  function assertTransferLive(id: string) {
    if (!isLiveTransfer(id)) throw new Error(`Transfer ${id} does not exist or was deleted`);
  }

  /** A Transfer's fee is edited and deleted through its Transfer. */
  function assertNotFee(transactionId: string) {
    if (text(transactions.get(transactionId)!, "transferId"))
      throw new Error("This is a Transfer fee: change it through its Transfer");
  }

  function hasHistory(accountId: string): boolean {
    return (
      liveTransactionsOn(accountId).length > 0 ||
      liveTransfers().some((id) => {
        const f = transfers.get(id)!;
        return text(f, "fromAccountId") === accountId || text(f, "toAccountId") === accountId;
      })
    );
  }

  /** `checkFee` is off for an update that leaves the fee alone, so a later change to its Category cannot block it. */
  function checkTransfer(next: NewTransfer, previous?: Transfer, checkFee = true) {
    assertDate(next.date);
    if (next.time !== undefined && next.time !== "") assertTime(next.time);
    if (next.fromAccountId === next.toAccountId)
      throw new Error("A Transfer needs two different Accounts: not the same account");
    for (const key of ["fromAccountId", "toAccountId"] as const) {
      assertAccount(next[key]);
      if (previous === undefined || previous[key] !== next[key])
        assertOpenForTransactions(next[key]);
    }
    for (const amount of [next.fromAmount, next.toAmount]) {
      assertAmount(amount);
      if (amount <= 0) throw new Error("A Transfer amount must be above zero");
    }
    const from = readAccount(next.fromAccountId);
    const to = readAccount(next.toAccountId);
    if (from.currency === to.currency && next.fromAmount !== next.toAmount)
      throw new Error("Accounts in the same currency must send and receive the same amount");
    if (checkFee && next.fee !== undefined) {
      assertAmount(next.fee.amount);
      if (next.fee.amount <= 0) throw new Error("A fee must be above zero");
      assertCategory(next.fee.categoryId);
      if (categoryKind(next.fee.categoryId) !== "expense")
        throw new Error("A fee is spending: it needs an expense Category");
    }
  }

  function feeOps(transferId: string, transfer: NewTransfer, rate: string): Op[] {
    const id = feeIdOf(transferId);
    const lineId = feeLineIdOf(transferId);
    const fee = transfer.fee;
    if (fee === undefined)
      return isLive(id) ? opsFor("transaction", id, { deletedAt: clock.now() }) : [];
    const where = { accountId: transfer.fromAccountId, date: transfer.date, rate };
    const spending = { categoryId: fee.categoryId, amount: -fee.amount };
    if (transactions.has(id))
      return [
        ...opsFor("transaction", id, { ...where, deletedAt: 0 }),
        ...opsFor("line", lineId, spending),
      ];
    return [
      ...opsFor("transaction", id, { ...where, transferId, createdAt: clock.now() }),
      ...opsFor("line", lineId, { transactionId: id, ...spending }),
    ];
  }

  /**
   * The rate to store for a Transaction on `accountId`: checked against the base currency, and
   * empty when none applies. Skipped where there is nothing to compare with.
   */
  function resolveRate(accountId: string, rate: string | undefined, required = true): string {
    const given = rate === undefined ? undefined : normalizeRate(rate);
    if (rate !== undefined && given === undefined) throw new Error(`Invalid rate "${rate}"`);
    const base = readSettings().baseCurrency;
    const account = accounts.get(accountId);
    if (base === undefined || account === undefined) return given ?? "";
    const currency = text(account, "currency");
    if (currency === base) {
      if (given !== undefined && given !== "1")
        throw new Error("A Transaction in the base currency has no rate");
      return "";
    }
    if (given === undefined) {
      if (!required) return "";
      throw new Error(`A Transaction in ${currency} needs a rate to ${base}`);
    }
    return given;
  }

  function checkOriginal(original: OriginalAmount) {
    assertAmount(original.amount);
    if (original.amount <= 0) throw new Error("The original amount must be above zero");
    assertCurrency(original.currency);
  }

  /** Rate and original amount fields to write for a change to `current`. */
  function currencyFields(
    current: Transaction | undefined,
    patch: TransactionPatch,
    rateRequired = true,
  ): Record<string, OpValue | undefined> {
    const out: Record<string, OpValue | undefined> = {};
    const moved =
      patch.accountId !== undefined &&
      (current === undefined || patch.accountId !== current.accountId);
    // An edit that keeps the Account and gives no rate leaves the stored rate alone, so an old
    // Transaction from before rates existed can still be edited.
    if (moved || patch.rate !== undefined) {
      const accountId = patch.accountId ?? current!.accountId;
      out["rate"] = resolveRate(
        accountId,
        moved ? patch.rate : (patch.rate ?? current?.rate),
        rateRequired,
      );
    }
    if (patch.original === null) {
      out["originalAmount"] = 0;
      out["originalCurrency"] = "";
    } else if (patch.original !== undefined) {
      checkOriginal(patch.original);
      out["originalAmount"] = patch.original.amount;
      out["originalCurrency"] = patch.original.currency;
    }
    return out;
  }

  function validateTransactionFields(values: TransactionPatch) {
    if (values.date !== undefined) assertDate(values.date);
    // An empty string clears the time.
    if (values.time !== undefined && values.time !== "") assertTime(values.time);
  }

  function pick<K extends string>(source: Partial<Record<K, OpValue>>, keys: readonly K[]) {
    return Object.fromEntries(keys.map((key) => [key, source[key]])) as Record<
      K,
      OpValue | undefined
    >;
  }

  /** What a budget record holds: its settings and every amount it has had. */
  interface StoredBudget {
    /** Absent for the overall budget. */
    categoryId?: string;
    period: BudgetPeriod;
    carryOver: boolean;
    /** The day it was set, where carry-over starts. */
    since: string;
    /** The amount before any recorded change. */
    base: number;
    /** Amounts from the first day of a period onward, oldest first. */
    changes: { from: string; amount: number }[];
  }

  const OVERALL_ID = "budget-overall";

  const isLiveBudget = (f: Fields | undefined): f is Fields =>
    f !== undefined && Number(f.get("deletedAt")?.value ?? 0) <= 0 && f.has("amount");

  function readStored(f: Fields, categoryId?: string): StoredBudget {
    const period = text(f, "period") as BudgetPeriod | undefined;
    const changes = [...f.entries()]
      .filter(([name]) => name.startsWith("amount@"))
      .map(([name, { value }]) => ({ from: name.slice("amount@".length), amount: Number(value) }))
      .sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
    return {
      ...(categoryId !== undefined ? { categoryId } : {}),
      period: period !== undefined && BUDGET_PERIODS.includes(period) ? period : "month",
      carryOver: Number(f.get("carryOver")?.value ?? 0) === 1,
      since: text(f, "since") ?? "1970-01-01",
      base: Number(f.get("amount")!.value),
      changes,
    };
  }

  /** The amount in force in the period starting on `from`. */
  function amountIn(budget: StoredBudget, from: string): number {
    let amount = budget.base;
    for (const change of budget.changes) if (change.from <= from) amount = change.amount;
    return amount;
  }

  const latestAmount = (budget: StoredBudget) =>
    budget.changes.length > 0 ? budget.changes[budget.changes.length - 1]!.amount : budget.base;

  /** Live budgets on live expense Categories, following merges; the newest wins if two merge into one. */
  function storedCategoryBudgets(): StoredBudget[] {
    const byCategory = new Map<string, { budget: StoredBudget; edited: Hlc }>();
    for (const [id, f] of budgets) {
      // A tombstone can arrive before the budget it removes; only a complete record counts.
      if (id === OVERALL_ID || !isLiveBudget(f) || !f.has("categoryId")) continue;
      const target = resolveCategory(text(f, "categoryId")!);
      if (!isLiveCategory(target) || categoryKind(target) !== "expense") continue;
      const edited = lastEdited(f);
      const current = byCategory.get(target);
      if (current === undefined || compareHlc(edited, current.edited) > 0)
        byCategory.set(target, { budget: readStored(f, target), edited });
    }
    const order = new Map(allCategories().map((c, index) => [c.id, index]));
    return [...byCategory.values()]
      .map((entry) => entry.budget)
      .sort((a, b) => (order.get(a.categoryId!) ?? 0) - (order.get(b.categoryId!) ?? 0));
  }

  function storedOverallBudget(): StoredBudget | undefined {
    const f = budgets.get(OVERALL_ID);
    return isLiveBudget(f) ? readStored(f) : undefined;
  }

  const asBudget = (b: StoredBudget): Budget => ({
    categoryId: b.categoryId!,
    amount: latestAmount(b),
    period: b.period,
    carryOver: b.carryOver,
  });

  const asOverall = (b: StoredBudget): OverallBudget => ({
    amount: latestAmount(b),
    period: b.period,
    carryOver: b.carryOver,
  });

  function currentBudgets(): Budget[] {
    return storedCategoryBudgets().map(asBudget);
  }

  const budgetToday = (today: string | undefined): string => {
    if (today !== undefined) {
      assertDate(today);
      return today;
    }
    return new Date(clock.now()).toISOString().slice(0, 10);
  };

  function assertBudgetAmount(amount: number) {
    assertAmount(amount);
    if (amount <= 0) throw new Error("A budget must be above zero");
  }

  function assertBudgetPeriod(period: BudgetPeriod) {
    if (!BUDGET_PERIODS.includes(period)) throw new Error(`Invalid budget period "${period}"`);
  }

  /** A budget, the budgets above it and the budgets inside it all count in the same periods. */
  function assertSamePeriod(categoryId: string, period: BudgetPeriod) {
    const parents = effectiveParents();
    for (const other of storedCategoryBudgets()) {
      if (other.categoryId === categoryId || other.period === period) continue;
      if (
        isInside(other.categoryId!, categoryId, parents) ||
        isInside(categoryId, other.categoryId!, parents)
      )
        throw new Error(
          "A budget must use the same period as the budgets above and inside its Category",
        );
    }
  }

  /** Writes a budget: a new one records where it started, a change records its amount from this period. */
  function budgetOps(
    id: string,
    extra: Record<string, OpValue>,
    live: StoredBudget | undefined,
    amount: number,
    options: BudgetOptions,
  ): Op[] {
    const today = budgetToday(options.today);
    const period = options.period ?? live?.period ?? "month";
    const carryOver = options.carryOver ?? live?.carryOver ?? false;
    const from = budgetPeriodOf(today, period, readSettings().budgetStartDay ?? 1).from;
    return opsFor("budget", id, {
      ...extra,
      period,
      carryOver: carryOver ? 1 : 0,
      deletedAt: 0,
      ...(live === undefined ? { amount, since: today } : {}),
      [`amount@${from}`]: amount,
    });
  }

  function liveRecord(id: string): Fields | undefined {
    const f = budgets.get(id);
    return isLiveBudget(f) ? f : undefined;
  }

  function reportInput(query: SpendingQuery): SpendingInput {
    return {
      ...query,
      base: readSettings().baseCurrency,
      transactions: [...transactions.keys()].flatMap((id) => readTransaction(id) ?? []),
      accountCurrency: new Map(
        [...accounts.entries()].map(([id, f]) => [id, text(f, "currency") as CurrencyCode]),
      ),
      categories: allCategories(),
      excluded: new Set([BALANCE_ADJUSTMENT_CATEGORY]),
    };
  }

  function balanceOf(accountId: string): number {
    assertAccount(accountId);
    const opening = readAccount(accountId).openingBalance;
    const spent = liveTransactionsOn(accountId).reduce((sum, tx) => sum + tx.total, opening);
    return liveTransfers().reduce((sum, id) => {
      const f = transfers.get(id)!;
      const out = text(f, "fromAccountId") === accountId ? Number(f.get("fromAmount")!.value) : 0;
      const into = text(f, "toAccountId") === accountId ? Number(f.get("toAmount")!.value) : 0;
      return sum - out + into;
    }, spent);
  }

  async function record(input: NewTransaction, rateRequired = true): Promise<Transaction> {
    validateTransactionFields(input);
    assertOpenForTransactions(input.accountId);
    if (input.lines.length === 0) throw new Error("A Transaction needs at least one Line");
    for (const line of input.lines) assertAmount(line.amount);
    const money = currencyFields(undefined, input, rateRequired);

    const id = newUuidV7(clock, random);
    const ops = opsFor("transaction", id, {
      ...pick(input, TRANSACTION_FIELDS),
      ...money,
      createdAt: clock.now(),
    });
    for (const line of input.lines) {
      const lineId = newUuidV7(clock, random);
      ops.push(...opsFor("line", lineId, { transactionId: id, ...pick(line, LINE_FIELDS) }));
    }
    await commit(ops);
    return readTransaction(id)!;
  }

  // --- Public API

  // --- Recurring items

  const DEFAULT_WINDOW_DAYS = 15;

  function liveItem(id: string): Fields | undefined {
    const f = recurringItems.get(id);
    return f !== undefined && f.has("name") && Number(f.get("deletedAt")?.value ?? 0) <= 0
      ? f
      : undefined;
  }

  function readItem(id: string): RecurringItem {
    const f = recurringItems.get(id)!;
    const number = (name: string) => (f.has(name) ? Number(f.get(name)!.value) : undefined);
    const optional = (name: string) => text(f, name) || undefined;
    const endDate = optional("endDate");
    const endCount = number("endCount");
    const toAmount = number("toAmount") || undefined;
    return {
      id,
      name: text(f, "name")!,
      kind: text(f, "kind") as RecurringItem["kind"],
      accountId: text(f, "accountId")!,
      ...(optional("toAccountId") ? { toAccountId: optional("toAccountId")! } : {}),
      ...(optional("categoryId") ? { categoryId: optional("categoryId")! } : {}),
      amount: number("amount")!,
      ...(toAmount !== undefined ? { toAmount } : {}),
      every: number("every")!,
      unit: text(f, "unit") as RecurringItem["unit"],
      start: text(f, "start")!,
      lastDay: number("lastDay") === 1,
      ...(endDate !== undefined ? { endDate } : {}),
      ...(endCount ? { endCount } : {}),
      createdAt: number("createdAt")!,
    };
  }

  function assertItem(id: string): RecurringItem {
    if (liveItem(id) === undefined) throw new Error(`Recurring item ${id} does not exist`);
    return readItem(id);
  }

  function checkItem(next: RecurringItem | (NewRecurring & { id?: undefined })) {
    if (next.name.trim() === "") throw new Error("A recurring item needs a name");
    if (!RECURRING_KINDS.includes(next.kind)) throw new Error(`Invalid kind "${next.kind}"`);
    assertAccount(next.accountId);
    if (next.kind === "transfer") {
      if (next.categoryId !== undefined) throw new Error("A transfer has no Category");
      if (next.toAccountId === undefined) throw new Error("A transfer needs a destination Account");
      assertAccount(next.toAccountId);
      if (next.toAccountId === next.accountId)
        throw new Error("A transfer needs two different Accounts");
    } else {
      if (next.toAccountId !== undefined) throw new Error("Only a transfer has a destination");
      if (next.toAmount !== undefined) throw new Error("Only a transfer has a destination amount");
      if (next.categoryId === undefined) throw new Error("An expense or income needs a Category");
      assertCategory(next.categoryId);
      if (categoryKind(next.categoryId) !== next.kind)
        throw new Error(`The Category must be an ${next.kind} Category`);
    }
    for (const amount of [next.amount, next.toAmount]) {
      if (amount === undefined) continue;
      assertAmount(amount);
      if (amount <= 0) throw new Error("The amount must be above zero");
    }
    if (!Number.isSafeInteger(next.every) || next.every <= 0)
      throw new Error("Every must be a whole number above zero");
    if (!RECURRING_UNITS.includes(next.unit)) throw new Error(`Invalid unit "${next.unit}"`);
    assertDate(next.start);
    if (next.endDate !== undefined) {
      assertDate(next.endDate);
      if (next.endDate < next.start) throw new Error("The end date is before the start");
    }
    if (next.endCount !== undefined && (!Number.isSafeInteger(next.endCount) || next.endCount <= 0))
      throw new Error("The number of occurrences must be a whole number above zero");
  }

  /** The item's fields as ops values; an empty string clears an optional one. */
  function itemValues(item: Partial<RecurringItem>): Record<string, OpValue | undefined> {
    return {
      name: item.name?.trim(),
      kind: item.kind,
      accountId: item.accountId,
      toAccountId: item.toAccountId,
      categoryId: item.categoryId,
      amount: item.amount,
      toAmount: item.toAmount,
      every: item.every,
      unit: item.unit,
      start: item.start,
      lastDay: item.lastDay === undefined ? undefined : item.lastDay ? 1 : 0,
      endDate: item.endDate,
      endCount: item.endCount,
    };
  }

  function assertScheduled(item: RecurringItem, due: string) {
    assertDate(due);
    if (dueDates(item, due, due).length === 0) throw new Error(`${item.name} is not due on ${due}`);
  }

  /** What became of an occurrence: paid (with what pays it), skipped, or still to act on. */
  function resolution(item: RecurringItem, due: string) {
    const f = occurrences.get(occurrenceId(item.id, due));
    const expected = f?.has("expected") ? Number(f.get("expected")!.value) : item.amount;
    const status = f && text(f, "status");
    if (status === "skipped") return { state: "skipped" as const, expected };
    if (status === "paid") {
      const transactionId = text(f!, "transactionId") || undefined;
      const transferId = text(f!, "transferId") || undefined;
      const transaction = transactionId ? readTransaction(transactionId) : undefined;
      const transfer =
        transferId && isLiveTransfer(transferId) ? readTransfer(transferId) : undefined;
      // A payment that was deleted no longer pays the bill.
      if (transaction || transfer)
        return { state: "paid" as const, expected, transaction, transfer };
    }
    return { state: "open" as const, expected };
  }

  function occurrenceOf(
    item: RecurringItem,
    due: string,
    today: string,
    dueSoonDays: number,
  ): Occurrence {
    const found = resolution(item, due);
    const paid =
      found.state === "paid"
        ? found.transaction
          ? Math.abs(found.transaction.total)
          : found.transfer!.fromAmount
        : undefined;
    const status = found.state === "open" ? openStatus(due, today, dueSoonDays) : found.state;
    return {
      id: occurrenceId(item.id, due),
      itemId: item.id,
      name: item.name,
      kind: item.kind,
      accountId: item.accountId,
      ...(item.toAccountId ? { toAccountId: item.toAccountId } : {}),
      ...(item.categoryId ? { categoryId: item.categoryId } : {}),
      due,
      status,
      expected: found.expected,
      ...(paid !== undefined ? { paid, difference: found.expected - paid } : {}),
      ...(found.state === "paid" && found.transaction
        ? { transactionId: found.transaction.id }
        : {}),
      ...(found.state === "paid" && found.transfer ? { transferId: found.transfer.id } : {}),
    };
  }

  function resolveOps(
    item: RecurringItem,
    due: string,
    values: Record<string, OpValue | undefined>,
  ): Op[] {
    return opsFor("occurrence", occurrenceId(item.id, due), {
      itemId: item.id,
      due,
      expected: resolution(item, due).expected,
      resolvedAt: clock.now(),
      ...values,
    });
  }

  function assertOpen(item: RecurringItem, due: string) {
    assertScheduled(item, due);
    const found = resolution(item, due);
    if (found.state === "paid") throw new Error(`${item.name} on ${due} is already paid`);
    if (found.state === "skipped")
      throw new Error(`${item.name} on ${due} was skipped: reopen it first`);
  }

  /** Occurrences of an item before a date that nobody has acted on. */
  function openBefore(item: RecurringItem, before: string): string[] {
    return dueDates(item, item.start, before).filter(
      (due) => due < before && resolution(item, due).state === "open",
    );
  }

  const engine: Engine = {
    recordTransaction: record,
    async editTransaction(id, patch) {
      assertLive(id);
      assertNotFee(id);
      validateTransactionFields(patch);
      const money = currencyFields(readTransaction(id), patch);
      await commit(opsFor("transaction", id, { ...pick(patch, TRANSACTION_FIELDS), ...money }));
    },
    async editLine(transactionId, lineId, patch) {
      assertLive(transactionId);
      assertNotFee(transactionId);
      if (!lineIdsByTransaction.get(transactionId)?.has(lineId)) {
        throw new Error(`Line ${lineId} does not belong to Transaction ${transactionId}`);
      }
      if (patch.amount !== undefined) assertAmount(patch.amount);
      await commit(opsFor("line", lineId, pick(patch, LINE_FIELDS)));
    },
    async updateTransaction(id, patch, updates) {
      assertLive(id);
      assertNotFee(id);
      validateTransactionFields(patch);
      if (patch.accountId !== undefined) assertOpenForTransactions(patch.accountId);
      if (updates.length === 0) throw new Error("A Transaction needs at least one Line");
      const owned = [...(lineIdsByTransaction.get(id) ?? [])].filter(
        (lineId) => !lines.get(lineId)!.has("deletedAt"),
      );
      const ids = updates.flatMap((update) => (update.id !== undefined ? [update.id] : []));
      if (new Set(ids).size !== ids.length) throw new Error("A Line appears more than once");
      for (const update of updates) {
        assertAmount(update.amount);
        if (update.id !== undefined && !owned.includes(update.id))
          throw new Error(`Line ${update.id} does not belong to Transaction ${id}`);
      }
      const kept = new Set(
        updates.flatMap((update) => (update.id !== undefined ? [update.id] : [])),
      );
      const money = currencyFields(readTransaction(id), patch);
      const ops = opsFor("transaction", id, { ...pick(patch, TRANSACTION_FIELDS), ...money });
      for (const update of updates) {
        const lineId = update.id ?? newUuidV7(clock, random);
        ops.push(
          ...opsFor("line", lineId, {
            ...(update.id === undefined ? { transactionId: id } : {}),
            ...pick(update, LINE_FIELDS),
          }),
        );
      }
      for (const lineId of owned)
        if (!kept.has(lineId)) ops.push(...opsFor("line", lineId, { deletedAt: clock.now() }));
      await commit(ops);
      return readTransaction(id)!;
    },
    async deleteTransaction(id) {
      assertLive(id);
      assertNotFee(id);
      await commit(opsFor("transaction", id, { deletedAt: clock.now() }));
    },
    getTransaction: async (id) => readTransaction(id),
    getSettings: readSettings,
    async setPreferences(patch) {
      if (patch.numberFormat !== undefined && !NUMBER_FORMATS.includes(patch.numberFormat))
        throw new Error(`Invalid number format "${patch.numberFormat}"`);
      if (patch.dateFormat !== undefined && !dateFormats.includes(patch.dateFormat))
        throw new Error(`Invalid date format "${patch.dateFormat}"`);
      if (patch.budgetNearLimit !== undefined && !isNearLimit(patch.budgetNearLimit))
        throw new Error(`The near-limit setting must be a whole percent from 1 to 99`);
      if (patch.budgetStartDay !== undefined && !isStartDay(patch.budgetStartDay))
        throw new Error(`The budget start day must be a whole number from 1 to 28`);
      // Only what is named is written; an explicit `undefined` is not a change.
      const named = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );
      await commit(opsFor("settings", SETTINGS_ID, named));
    },
    async completeSetup({ baseCurrency, account }) {
      if (readSettings().baseCurrency !== undefined) throw new Error("Setup is already complete");
      assertCurrency(baseCurrency);
      const checked = checkAccount(account);
      const created = accountOps(checked);
      const setupAt = clock.now();
      await commit([
        ...opsFor("settings", SETTINGS_ID, { baseCurrency, setupAt, defaultAccountId: created.id }),
        ...created.ops,
      ]);
      return readAccount(created.id);
    },
    async createAccount(input) {
      const created = accountOps(checkAccount(input));
      await commit(created.ops);
      return readAccount(created.id);
    },
    async listAccounts() {
      return [...accounts.keys()]
        .filter(isLiveAccount)
        .map(readAccount)
        .sort((a, b) => (a.createdAt === b.createdAt ? byId(a, b) : a.createdAt - b.createdAt));
    },
    async editAccount(id, patch) {
      assertAccount(id);
      const current = readAccount(id);
      const { isLiability, icon, color, ...fields } = patch;
      const merged = checkAccount({ ...current, ...fields });
      if (icon) assertAccountIcon(icon);
      if (color) assertAccountColor(color);
      if (merged.currency !== current.currency && hasHistory(id))
        throw new Error("The currency cannot change once the Account has Transactions");
      await commit(
        opsFor("account", id, {
          ...pick(merged, ["name", "kind", "currency"] as const),
          ...(icon !== undefined ? { icon } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(isLiability !== undefined ? { isLiability: isLiability ? 1 : 0 } : {}),
        }),
      );
      return readAccount(id);
    },
    getBalance: async (accountId) => balanceOf(accountId),
    async adjustBalance(accountId, { target, date }) {
      assertAmount(target);
      const difference = target - balanceOf(accountId);
      if (difference === 0) throw new Error("The balance is already correct");
      // Reports leave a Balance adjustment out, so it needs no rate even on a foreign Account.
      return record(
        {
          accountId,
          date,
          lines: [{ categoryId: BALANCE_ADJUSTMENT_CATEGORY, amount: difference }],
        },
        false,
      );
    },
    async deleteAccount(id) {
      assertAccount(id);
      if (hasHistory(id)) throw new Error("An Account with history can only be archived");
      await commit(opsFor("account", id, { deletedAt: clock.now() }));
    },
    async archiveAccount(id) {
      assertAccount(id);
      await commit(opsFor("account", id, { archivedAt: clock.now() }));
    },
    async unarchiveAccount(id) {
      assertAccount(id);
      await commit(opsFor("account", id, { archivedAt: 0 }));
    },
    async setDefaultAccount(id) {
      if (id !== undefined) {
        assertAccount(id);
        if (archivedAt(accounts.get(id)!) !== undefined)
          throw new Error("An archived Account cannot be the default");
      }
      await commit(opsFor("settings", SETTINGS_ID, { defaultAccountId: id ?? "" }));
    },
    async createCategory(input) {
      const name = checkName(input.name, "Category");
      if (input.kind !== "income" && input.kind !== "expense")
        throw new Error(`Invalid Category kind "${input.kind}"`);
      if (input.parentId !== undefined) {
        assertCategory(input.parentId);
        if (categoryKind(input.parentId) !== input.kind)
          throw new Error("A Category must be the same kind as its parent");
      }
      const id = newUuidV7(clock, random);
      await commit(
        opsFor("category", id, {
          name,
          kind: input.kind,
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          createdAt: clock.now(),
        }),
      );
      return readCategory(id, effectiveParents());
    },
    async editCategory(id, patch) {
      assertCategory(id);
      await commit(opsFor("category", id, { name: checkName(patch.name, "Category") }));
      return readCategory(id, effectiveParents());
    },
    async moveCategory(id, parentId) {
      assertCategory(id);
      if (parentId !== undefined) {
        assertCategory(parentId);
        if (categoryKind(parentId) !== categoryKind(id))
          throw new Error("A Category must be the same kind as its parent");
        if (isInside(parentId, id, effectiveParents()))
          throw new Error("A Category cannot move under itself or its descendant");
      }
      await commit(opsFor("category", id, { parentId: parentId ?? "" }));
    },
    async deleteCategory(id) {
      assertCategory(id);
      const inUse = [...transactions.keys()].some((txId) =>
        readTransaction(txId)?.lines.some((line) => line.categoryId === id),
      );
      if (inUse) throw new Error("Lines use this Category: merge it into another Category instead");
      const parents = effectiveParents();
      const up = parents.get(id);
      const ops = [...parents.entries()]
        .filter(([, parent]) => parent === id)
        .flatMap(([child]) => opsFor("category", child, { parentId: up ?? "" }));
      await commit([...ops, ...opsFor("category", id, { deletedAt: clock.now() })]);
    },
    async mergeCategory(id, intoId) {
      assertCategory(id);
      assertCategory(intoId);
      if (id === intoId) throw new Error("A Category cannot be merged into itself");
      if (categoryKind(id) !== categoryKind(intoId))
        throw new Error("Categories can only merge with the same kind");
      const parents = effectiveParents();
      const ops: Op[] = [];
      // Merging into its own descendant would make a cycle: that descendant goes to the top level.
      if (isInside(intoId, id, parents)) ops.push(...opsFor("category", intoId, { parentId: "" }));
      ops.push(...opsFor("category", id, { mergedInto: intoId }));
      await commit(ops);
    },
    async getCategory(id) {
      if (id === BALANCE_ADJUSTMENT_CATEGORY) return BALANCE_ADJUSTMENT;
      const resolved = resolveCategory(id);
      return isLiveCategory(resolved) ? readCategory(resolved, effectiveParents()) : undefined;
    },
    listCategories: async () => allCategories(),
    async searchCategories(query, options) {
      const all = allCategories();
      const byId = new Map(all.map((c) => [c.id, c]));
      const needle = query.trim().toLowerCase();
      return all
        .filter(
          (c) =>
            (options?.kind === undefined || c.kind === options.kind) &&
            c.name.toLowerCase().includes(needle),
        )
        .map((category) => ({ category, path: pathOf(category, byId) }));
    },
    async recentCategories(limit) {
      const all = allCategories();
      const lookup = new Map(all.map((c) => [c.id, c]));
      const recent = [...transactions.keys()]
        .flatMap((txId) => readTransaction(txId) ?? [])
        .sort((a, b) =>
          a.date !== b.date
            ? a.date < b.date
              ? 1
              : -1
            : a.createdAt !== b.createdAt
              ? b.createdAt - a.createdAt
              : byId(b, a),
        );
      const out: Category[] = [];
      for (const tx of recent)
        for (const line of tx.lines) {
          const category = lookup.get(line.categoryId);
          if (category && !out.includes(category) && out.length < limit) out.push(category);
        }
      return out;
    },
    async createTag(name) {
      const trimmed = checkName(name, "Tag");
      const existing = liveTags().find(
        (id) => readTag(id).name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (existing !== undefined) return readTag(existing);
      const id = newUuidV7(clock, random);
      await commit(opsFor("tag", id, { name: trimmed, createdAt: clock.now() }));
      return readTag(id);
    },
    async renameTag(id, name) {
      assertTag(id);
      await commit(opsFor("tag", id, { name: checkName(name, "Tag") }));
      return readTag(id);
    },
    async deleteTag(id) {
      assertTag(id);
      await commit(opsFor("tag", id, { deletedAt: clock.now() }));
    },
    listTags: async () => liveTags().map(readTag),
    async tagTransaction(transactionId, tagId) {
      assertLive(transactionId);
      assertTag(tagId);
      await setTagging(transactionId, tagId, 1);
    },
    async untagTransaction(transactionId, tagId) {
      assertLive(transactionId);
      await setTagging(transactionId, tagId, 0);
    },
    async recordTransfer(input) {
      checkTransfer(input);
      const id = newUuidV7(clock, random);
      await commit([
        ...opsFor("transfer", id, {
          ...pick(input, TRANSFER_FIELDS),
          createdAt: clock.now(),
        }),
        ...feeOps(id, input, input.fee ? resolveRate(input.fromAccountId, input.fee.rate) : ""),
      ]);
      return readTransfer(id);
    },
    async updateTransfer(id, patch) {
      assertTransferLive(id);
      const current = readTransfer(id);
      const { fee, ...fields } = patch;
      const next: NewTransfer = { ...current, ...fields };
      if (fee === null) delete next.fee;
      else if (fee !== undefined) next.fee = fee;
      checkTransfer(next, current, fee !== undefined);
      // A changed fee is checked against the sending Account; an untouched one keeps its rate.
      const movedFrom = next.fromAccountId !== current.fromAccountId;
      const feeRate = next.fee
        ? fee !== undefined || movedFrom
          ? resolveRate(next.fromAccountId, fee ? fee.rate : undefined)
          : (current.fee?.rate ?? "")
        : "";
      await commit([
        ...opsFor("transfer", id, pick(fields, TRANSFER_FIELDS)),
        ...feeOps(id, next, feeRate),
      ]);
      return readTransfer(id);
    },
    async deleteTransfer(id) {
      assertTransferLive(id);
      const feeId = feeTransactionOf(id);
      await commit([
        ...opsFor("transfer", id, { deletedAt: clock.now() }),
        ...(feeId !== undefined ? opsFor("transaction", feeId, { deletedAt: clock.now() }) : []),
      ]);
    },
    getTransfer: async (id) => (isLiveTransfer(id) ? readTransfer(id) : undefined),
    async listTransfers() {
      return liveTransfers()
        .map(readTransfer)
        .sort((a, b) =>
          a.date === b.date ? a.createdAt - b.createdAt || byId(a, b) : a.date < b.date ? -1 : 1,
        );
    },
    async getBaseAmounts(transactionId) {
      const tx = readTransaction(transactionId);
      const base = readSettings().baseCurrency;
      const account = tx ? accounts.get(tx.accountId) : undefined;
      if (tx === undefined || base === undefined || account === undefined) return undefined;
      const currency = text(account, "currency") as CurrencyCode;
      if (currency === base) return { lines: tx.lines.map((line) => line.amount), total: tx.total };
      if (tx.rate === undefined) return undefined;
      const converted = tx.lines.map((line) => convertMinor(line.amount, tx.rate!, currency, base));
      return { lines: converted, total: converted.reduce((sum, amount) => sum + amount, 0) };
    },
    spendingByCategory: async (query) => spendingByCategory(reportInput(query)),
    dailyTotals: async (query) => dailyTotals(reportInput(query)),
    monthlyTotals: async (query) => monthlyTotals(reportInput(query)),
    async setBudget(categoryId, amount, options = {}) {
      assertCategory(categoryId);
      if (categoryKind(categoryId) !== "expense")
        throw new Error("A budget goes on an expense Category");
      assertBudgetAmount(amount);
      const id = `budget-${categoryId}`;
      const f = liveRecord(id);
      const live = f && readStored(f, categoryId);
      const period = options.period ?? live?.period ?? "month";
      assertBudgetPeriod(period);
      assertSamePeriod(categoryId, period);
      // One record per Category, so two devices setting the same budget write to the same fields.
      await commit(budgetOps(id, { categoryId }, live, amount, options));
      return asBudget(readStored(budgets.get(id)!, categoryId));
    },
    async removeBudget(categoryId) {
      const id = `budget-${categoryId}`;
      if (liveRecord(id) === undefined)
        throw new Error(`There is no budget on Category ${categoryId}`);
      await commit(opsFor("budget", id, { deletedAt: clock.now() }));
    },
    async setOverallBudget(amount, options = {}) {
      assertBudgetAmount(amount);
      if (options.period !== undefined) assertBudgetPeriod(options.period);
      const f = liveRecord(OVERALL_ID);
      await commit(budgetOps(OVERALL_ID, {}, f && readStored(f), amount, options));
      return asOverall(readStored(budgets.get(OVERALL_ID)!));
    },
    async removeOverallBudget() {
      if (liveRecord(OVERALL_ID) === undefined) throw new Error("There is no overall budget");
      await commit(opsFor("budget", OVERALL_ID, { deletedAt: clock.now() }));
    },
    getOverallBudget: async () => {
      const stored = storedOverallBudget();
      return stored && asOverall(stored);
    },
    listBudgets: async () => currentBudgets(),
    async budgetProgress(on) {
      assertDate(on);
      const categoryBudgets = storedCategoryBudgets();
      const overallBudget = storedOverallBudget();
      if (categoryBudgets.length === 0 && overallBudget === undefined) return { categories: [] };
      const { budgetStartDay: startDay = 1, budgetNearLimit: near = DEFAULT_NEAR_LIMIT } =
        readSettings();
      const base = reportInput({ from: on, to: on, kind: "expense" });
      const byPeriod = new Map<string, { each: Map<string, number>; all: number }>();
      const spentIn = (budget: StoredBudget, range: Period): number => {
        const key = `${range.from}/${range.to}`;
        let totals = byPeriod.get(key);
        if (totals === undefined) {
          const input = { ...base, ...range };
          totals = { each: categoryTotals(input), all: spendingByCategory(input).total };
          byPeriod.set(key, totals);
        }
        return budget.categoryId === undefined
          ? totals.all
          : (totals.each.get(budget.categoryId) ?? 0);
      };
      const standing = (budget: StoredBudget): Standing => {
        const range = budgetPeriodOf(on, budget.period, startDay);
        // What earlier periods left, from the one the budget started in. Worked out, not stored.
        let carryIn = 0;
        if (budget.carryOver) {
          let past = budgetPeriodOf(budget.since, budget.period, startDay);
          while (past.from < range.from) {
            carryIn = amountIn(budget, past.from) + carryIn - spentIn(budget, past);
            past = budgetPeriodOf(dayAfter(past.to), budget.period, startDay);
          }
        }
        const amount = amountIn(budget, range.from);
        const limit = amount + carryIn;
        const spent = spentIn(budget, range);
        return {
          range,
          amount,
          carryIn,
          limit,
          spent,
          remaining: limit - spent,
          used: budgetUsed(spent, limit),
          state: budgetStateOf(spent, limit, near),
        };
      };
      const progress: BudgetProgress[] = categoryBudgets.map((budget) => ({
        categoryId: budget.categoryId!,
        name: text(categories.get(budget.categoryId!)!, "name")!,
        period: budget.period,
        carryOver: budget.carryOver,
        ...standing(budget),
      }));
      if (overallBudget === undefined) return { categories: progress };
      const parents = effectiveParents();
      const overall = standing(overallBudget);
      const allocated = categoryBudgets
        .filter((b) => b.period === overallBudget.period)
        // A Category inside another budgeted one is already part of that budget.
        .filter(
          (b) =>
            !categoryBudgets.some(
              (other) =>
                other.categoryId !== b.categoryId &&
                other.period === b.period &&
                isInside(b.categoryId!, other.categoryId!, parents),
            ),
        )
        .reduce((sum, b) => sum + amountIn(b, overall.range.from), 0);
      const standingOverall: OverallBudgetProgress = {
        period: overallBudget.period,
        carryOver: overallBudget.carryOver,
        ...overall,
        allocated,
        unallocated: overall.amount - allocated,
      };
      return { categories: progress, overall: standingOverall };
    },
    async createRecurring(input) {
      const item = { lastDay: false, ...input };
      checkItem(item);
      const id = newUuidV7(clock, random);
      await commit(
        opsFor("recurring", id, {
          ...itemValues({
            ...item,
            lastDay: item.lastDay && (item.unit === "month" || item.unit === "year"),
          }),
          createdAt: clock.now(),
          deletedAt: 0,
        }),
      );
      return readItem(id);
    },
    async updateRecurring(id, patch) {
      const current = assertItem(id);
      const { endDate, endCount, toAmount, categoryId, toAccountId, ...rest } = patch;
      const next = { ...current, ...rest } as RecurringItem;
      for (const [key, value] of [
        ["endDate", endDate],
        ["endCount", endCount],
        ["toAmount", toAmount],
        ["categoryId", categoryId],
        ["toAccountId", toAccountId],
      ] as const) {
        if (value === undefined) continue;
        if (value === null) delete (next as unknown as Record<string, unknown>)[key];
        else (next as unknown as Record<string, unknown>)[key] = value;
      }
      checkItem(next);
      await commit(
        opsFor("recurring", id, {
          ...itemValues(rest),
          ...Object.fromEntries(
            Object.entries({ endDate, endCount, toAmount, categoryId, toAccountId })
              .filter(([, value]) => value !== undefined)
              .map(([key, value]) => [key, value === null ? "" : (value as OpValue)]),
          ),
        }),
      );
      return readItem(id);
    },
    async deleteRecurring(id) {
      assertItem(id);
      await commit(opsFor("recurring", id, { deletedAt: clock.now() }));
    },
    listRecurring: async () =>
      [...recurringItems.keys()]
        .filter((id) => liveItem(id) !== undefined)
        .sort(creationOrder(recurringItems))
        .map(readItem),
    async listOccurrences(query) {
      assertDate(query.to);
      assertDate(query.today);
      const soon = query.dueSoonDays ?? DEFAULT_DUE_SOON_DAYS;
      const found: Occurrence[] = [];
      for (const id of [...recurringItems.keys()].sort(creationOrder(recurringItems))) {
        if (liveItem(id) === undefined) continue;
        const item = readItem(id);
        const due = new Set(dueDates(item, query.from ?? item.start, query.to));
        if (query.from !== undefined)
          // A paid or skipped occurrence stays in the history even if the schedule moved away.
          for (const f of occurrences.values())
            if (text(f, "itemId") === id && text(f, "status") !== "open") {
              const at = text(f, "due")!;
              if (at >= query.from && at <= query.to) due.add(at);
            }
        for (const at of due) {
          const occurrence = occurrenceOf(item, at, query.today, soon);
          if (
            query.from !== undefined ||
            ["upcoming", "due-soon", "overdue"].includes(occurrence.status)
          )
            found.push(occurrence);
        }
      }
      return found.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
    },
    async markPaid(itemId, due, options = {}) {
      const item = assertItem(itemId);
      assertOpen(item, due);
      const amount = options.amount ?? item.amount;
      const date = options.date ?? due;
      const note = options.note;
      if (item.kind === "transfer") {
        const transfer = await engine.recordTransfer({
          fromAccountId: item.accountId,
          toAccountId: item.toAccountId!,
          date,
          fromAmount: amount,
          toAmount: options.toAmount ?? item.toAmount ?? amount,
          ...(note ? { note } : {}),
        });
        await commit(resolveOps(item, due, { status: "paid", transferId: transfer.id }));
        return { transfer };
      }
      const transaction = await record({
        accountId: item.accountId,
        date,
        payee: item.name,
        ...(note ? { note } : {}),
        ...(options.rate !== undefined ? { rate: options.rate } : {}),
        lines: [{ categoryId: item.categoryId!, amount: signedAmount(item.kind, amount) }],
      });
      await commit(resolveOps(item, due, { status: "paid", transactionId: transaction.id }));
      return { transaction };
    },
    async linkCandidates(itemId, due, windowDays = DEFAULT_WINDOW_DAYS) {
      const item = assertItem(itemId);
      assertScheduled(item, due);
      const near = (date: string) => Math.abs(daysBetween(due, date)) <= windowDays;
      const taken = new Set(
        [...occurrences.values()].flatMap((f) => [text(f, "transactionId"), text(f, "transferId")]),
      );
      if (item.kind === "transfer")
        return {
          transactions: [],
          transfers: [...transfers.keys()]
            .filter(isLiveTransfer)
            .map(readTransfer)
            .filter(
              (t) =>
                t.fromAccountId === item.accountId &&
                t.toAccountId === item.toAccountId &&
                near(t.date) &&
                !taken.has(t.id),
            ),
        };
      return {
        transactions: [...transactions.keys()]
          .flatMap((id) => readTransaction(id) ?? [])
          .filter(
            (tx) =>
              tx.accountId === item.accountId &&
              !tx.transferId &&
              (item.kind === "expense" ? tx.total < 0 : tx.total > 0) &&
              tx.lines.every((line) => line.categoryId !== BALANCE_ADJUSTMENT_CATEGORY) &&
              near(tx.date) &&
              !taken.has(tx.id),
          )
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
        transfers: [],
      };
    },
    async linkOccurrence(itemId, due, target) {
      const item = assertItem(itemId);
      assertOpen(item, due);
      if ("transferId" in target) {
        assertTransferLive(target.transferId);
        const t = readTransfer(target.transferId);
        if (item.kind !== "transfer" || t.fromAccountId !== item.accountId)
          throw new Error("This Transfer does not fit the recurring item");
        await commit(resolveOps(item, due, { status: "paid", transferId: target.transferId }));
        return;
      }
      assertLive(target.transactionId);
      const tx = readTransaction(target.transactionId)!;
      if (item.kind === "transfer" || tx.accountId !== item.accountId)
        throw new Error("This Transaction does not fit the recurring item");
      await commit(resolveOps(item, due, { status: "paid", transactionId: target.transactionId }));
    },
    async skipOccurrence(itemId, due) {
      const item = assertItem(itemId);
      assertOpen(item, due);
      await commit(resolveOps(item, due, { status: "skipped" }));
    },
    async reopenOccurrence(itemId, due) {
      const item = assertItem(itemId);
      assertScheduled(item, due);
      if (resolution(item, due).state !== "skipped") throw new Error("Only a skipped one reopens");
      await commit(resolveOps(item, due, { status: "open" }));
    },
    async skipOlder(itemId, before) {
      const item = assertItem(itemId);
      assertDate(before);
      const older = openBefore(item, before);
      await commit(older.flatMap((due) => resolveOps(item, due, { status: "skipped" })));
      return older.length;
    },
    async listTransactions() {
      const live = [...transactions.keys()].flatMap((id) => readTransaction(id) ?? []);
      return live.sort((a, b) => (a.date === b.date ? byId(a, b) : a.date < b.date ? -1 : 1));
    },
    exportOps: () => store.readAll(),
    applyOps: (ops) => commit(ops),
  };
  return engine;
}
