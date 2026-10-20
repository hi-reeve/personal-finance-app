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

export type CategoryKind = "income" | "expense";

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
  const categories = new Map<string, Fields>();
  const tags = new Map<string, Fields>();
  const taggings = new Map<string, Fields>();
  const tables: Record<Entity, Map<string, Fields>> = {
    transaction: transactions,
    line: lines,
    account: accounts,
    settings,
    category: categories,
    tag: tags,
    tagging: taggings,
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
      categoryId: resolveCategory(text(f, "categoryId")!),
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
    const tagIds = tagsOn(id);
    return {
      id,
      accountId: text(f, "accountId")!,
      date: text(f, "date")!,
      ...(time !== undefined ? { time } : {}),
      ...(payee !== undefined ? { payee } : {}),
      ...(note !== undefined ? { note } : {}),
      lines: ownedLines,
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
    return {
      ...(baseCurrency !== undefined ? { baseCurrency } : {}),
      ...(setupAt !== undefined ? { setupAt: Number(setupAt) } : {}),
      ...(defaultOk ? { defaultAccountId: chosen } : {}),
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
      if (merged.currency !== current.currency && liveTransactionsOn(id).length > 0)
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
      return record({
        accountId,
        date,
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
    async listTransactions() {
      const live = [...transactions.keys()].flatMap((id) => readTransaction(id) ?? []);
      return live.sort((a, b) => (a.date === b.date ? byId(a, b) : a.date < b.date ? -1 : 1));
    },
    exportOps: () => store.readAll(),
    applyOps: (ops) => commit(ops),
  };
}
