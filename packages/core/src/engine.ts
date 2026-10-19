import type { Clock, OpStore, Random } from "./adapters";
import { compareHlc, type Hlc } from "./hlc";
import { newUuidV7 } from "./ids";
import type { Entity, Op, OpValue } from "./ops";
import { currencyCodes, type CurrencyCode } from "./format";
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
export type AccountPatch = Partial<Omit<NewAccount, "openingBalance">>;

/** Synced settings. Empty until first-run setup completes. */
export interface Settings {
  baseCurrency?: CurrencyCode;
  /** Epoch ms (UTC) when setup finished. */
  setupAt?: number;
  /** The Account Add starts on. Absent when none is chosen or it was archived or deleted. */
  defaultAccountId?: string;
}

export interface NewLine {
  categoryId: string;
  amount: number;
  itemName?: string;
}

export interface NewTransaction {
  accountId: string;
  date: string;
  time?: string;
  payee?: string;
  note?: string;
  lines: NewLine[];
}

export type TransactionPatch = Partial<Omit<NewTransaction, "lines">>;

export type LinePatch = Partial<NewLine>;

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
  /** Marks the Transaction deleted with a tombstone; history stays in the op log. */
  deleteTransaction(id: string): Promise<void>;
  getTransaction(id: string): Promise<Transaction | undefined>;
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
  /** Live Transactions, oldest date first. */
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
const SETTINGS_ID = "settings";

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
  const tables: Record<Entity, Map<string, Fields>> = {
    transaction: transactions,
    line: lines,
    account: accounts,
    settings,
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

  function isLive(id: string): boolean {
    const fields = transactions.get(id);
    return fields !== undefined && !fields.has("deletedAt");
  }

  function assertLive(id: string) {
    if (!isLive(id)) throw new Error(`Transaction ${id} does not exist or was deleted`);
  }

  function text(fields: Fields, name: string): string | undefined {
    const value = fields.get(name)?.value;
    return value === undefined ? undefined : String(value);
  }

  function readLine(lineId: string): Line {
    const f = lines.get(lineId)!;
    const itemName = text(f, "itemName");
    return {
      id: lineId,
      categoryId: text(f, "categoryId")!,
      amount: Number(f.get("amount")!.value),
      ...(itemName !== undefined ? { itemName } : {}),
    };
  }

  function readTransaction(id: string): Transaction | undefined {
    if (!isLive(id)) return undefined;
    const f = transactions.get(id)!;
    const owned = [...(lineIdsByTransaction.get(id) ?? [])].sort();
    const time = text(f, "time");
    const payee = text(f, "payee");
    const note = text(f, "note");
    let updatedAt = 0;
    for (const fields of [f, ...owned.map((lineId) => lines.get(lineId)!)]) {
      for (const { hlc } of fields.values()) updatedAt = Math.max(updatedAt, hlc.wall);
    }
    const ownedLines = owned.map(readLine);
    return {
      id,
      accountId: text(f, "accountId")!,
      date: text(f, "date")!,
      ...(time !== undefined ? { time } : {}),
      ...(payee !== undefined ? { payee } : {}),
      ...(note !== undefined ? { note } : {}),
      lines: ownedLines,
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
    const icon = text(f, "icon") as AccountIcon | undefined;
    const color = text(f, "color") as AccountColor | undefined;
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
    return {
      ...(baseCurrency !== undefined ? { baseCurrency } : {}),
      ...(setupAt !== undefined ? { setupAt: Number(setupAt) } : {}),
      ...(defaultOk ? { defaultAccountId: chosen } : {}),
    };
  }

  function validateTransactionFields(values: TransactionPatch) {
    if (values.date !== undefined) assertDate(values.date);
    if (values.time !== undefined) assertTime(values.time);
  }

  function pick<K extends string>(source: Partial<Record<K, OpValue>>, keys: readonly K[]) {
    return Object.fromEntries(keys.map((key) => [key, source[key]])) as Record<
      K,
      OpValue | undefined
    >;
  }

  function balanceOf(accountId: string): number {
    assertAccount(accountId);
    const opening = readAccount(accountId).openingBalance;
    return liveTransactionsOn(accountId).reduce((sum, tx) => sum + tx.total, opening);
  }

  async function record(input: NewTransaction): Promise<Transaction> {
    validateTransactionFields(input);
    assertOpenForTransactions(input.accountId);
    if (input.lines.length === 0) throw new Error("A Transaction needs at least one Line");
    for (const line of input.lines) assertAmount(line.amount);

    const id = newUuidV7(clock, random);
    const ops = opsFor("transaction", id, {
      ...pick(input, TRANSACTION_FIELDS),
      createdAt: clock.now(),
    });
    for (const line of input.lines) {
      const lineId = newUuidV7(clock, random);
      ops.push(...opsFor("line", lineId, { transactionId: id, ...pick(line, LINE_FIELDS) }));
    }
    await commit(ops);
    return readTransaction(id)!;
  }

  return {
    recordTransaction: record,
    async editTransaction(id, patch) {
      assertLive(id);
      validateTransactionFields(patch);
      await commit(opsFor("transaction", id, pick(patch, TRANSACTION_FIELDS)));
    },
    async editLine(transactionId, lineId, patch) {
      assertLive(transactionId);
      if (!lineIdsByTransaction.get(transactionId)?.has(lineId)) {
        throw new Error(`Line ${lineId} does not belong to Transaction ${transactionId}`);
      }
      if (patch.amount !== undefined) assertAmount(patch.amount);
      await commit(opsFor("line", lineId, pick(patch, LINE_FIELDS)));
    },
    async deleteTransaction(id) {
      assertLive(id);
      await commit(opsFor("transaction", id, { deletedAt: clock.now() }));
    },
    getTransaction: async (id) => readTransaction(id),
    getSettings: readSettings,
    async completeSetup({ baseCurrency, account }) {
      if (readSettings().baseCurrency !== undefined) throw new Error("Setup is already complete");
      assertCurrency(baseCurrency);
      const checked = checkAccount(account);
      const created = accountOps(checked);
      const setupAt = clock.now();
      await commit([...opsFor("settings", SETTINGS_ID, { baseCurrency, setupAt }), ...created.ops]);
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
      const { isLiability, ...fields } = patch;
      const merged = checkAccount({ ...current, ...fields });
      if (merged.currency !== current.currency && liveTransactionsOn(id).length > 0)
        throw new Error("The currency cannot change once the Account has Transactions");
      await commit(
        opsFor("account", id, {
          ...pick(merged, ["name", "kind", "currency", "icon", "color"] as const),
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
      return record({
        accountId,
        date,
        note: "Balance adjustment",
        lines: [{ categoryId: BALANCE_ADJUSTMENT_CATEGORY, amount: difference }],
      });
    },
    async deleteAccount(id) {
      assertAccount(id);
      if (liveTransactionsOn(id).length > 0)
        throw new Error("An Account with history can only be archived");
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
    async listTransactions() {
      const live = [...transactions.keys()].flatMap((id) => readTransaction(id) ?? []);
      return live.sort((a, b) => (a.date === b.date ? byId(a, b) : a.date < b.date ? -1 : 1));
    },
    exportOps: () => store.readAll(),
    applyOps: (ops) => commit(ops),
  };
}
