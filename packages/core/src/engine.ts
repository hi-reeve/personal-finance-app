import type { Clock, Random, Storage } from "./adapters";
import { compareHlc, type Hlc } from "./hlc";
import { newUuidV7 } from "./ids";
import type { Entity, Op } from "./ops";
import { assertAmount, assertDate, assertTime } from "./validate";

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

export type TransactionPatch = Partial<
  Pick<NewTransaction, "accountId" | "date" | "time" | "payee" | "note">
>;

export type LinePatch = Partial<NewLine>;

export interface EngineOptions {
  deviceId: string;
  clock: Clock;
  random: Random;
  storage: Storage;
}

export interface Engine {
  recordTransaction(input: NewTransaction): Promise<Transaction>;
  editTransaction(id: string, patch: TransactionPatch): Promise<void>;
  editLine(transactionId: string, lineId: string, patch: LinePatch): Promise<void>;
  /** Marks the Transaction deleted with a tombstone; history stays in the op log. */
  deleteTransaction(id: string): Promise<void>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  /** Every op this device holds, to send to another device. */
  exportOps(): Promise<Op[]>;
  /** Merge ops from another device. Safe to repeat and to deliver in any order. */
  applyOps(ops: readonly Op[]): Promise<void>;
  /** Live Transactions, oldest date first. */
  listTransactions(): Promise<Transaction[]>;
}

type Fields = Map<string, { value: string | number; hlc: Hlc }>;

export async function createEngine(options: EngineOptions): Promise<Engine> {
  const { deviceId, clock, random, storage } = options;
  const records = new Map<string, Fields>();
  const seen = new Set<string>();
  let last: Hlc = { wall: 0, counter: 0, device: deviceId };

  const key = (entity: Entity, id: string) => `${entity}:${id}`;

  function fold(op: Op) {
    if (seen.has(op.id)) return;
    seen.add(op.id);
    const k = key(op.entity, op.recordId);
    let fields = records.get(k);
    if (!fields) records.set(k, (fields = new Map()));
    const current = fields.get(op.field);
    if (!current || compareHlc(op.hlc, current.hlc) > 0) {
      fields.set(op.field, { value: op.value, hlc: op.hlc });
    }
  }

  for (const op of await storage.readAll()) fold(op);

  function tick(): Hlc {
    const wall = Math.max(last.wall, clock.now());
    const counter = wall === last.wall ? last.counter + 1 : 0;
    last = { wall, counter, device: deviceId };
    return last;
  }

  function makeOp(entity: Entity, recordId: string, field: string, value: string | number): Op {
    return { id: newUuidV7(clock, random), hlc: tick(), entity, recordId, field, value };
  }

  function read(entity: Entity, id: string): Record<string, string | number> | undefined {
    const fields = records.get(key(entity, id));
    if (!fields) return undefined;
    const out: Record<string, string | number> = {};
    for (const [name, { value }] of fields) out[name] = value;
    return out;
  }

  function toTransaction(id: string): Transaction | undefined {
    const t = read("transaction", id);
    if (!t || t["deletedAt"] !== undefined) return undefined;
    const lines: Line[] = [];
    for (const [k] of records) {
      if (!k.startsWith("line:")) continue;
      const lineId = k.slice(5);
      const l = read("line", lineId)!;
      if (l["transactionId"] !== id) continue;
      lines.push({
        id: lineId,
        categoryId: l["categoryId"] as string,
        amount: l["amount"] as number,
        ...(l["itemName"] !== undefined ? { itemName: l["itemName"] as string } : {}),
      });
    }
    lines.sort((a, b) => (a.id < b.id ? -1 : 1));
    return {
      id,
      accountId: t["accountId"] as string,
      date: t["date"] as string,
      ...(t["time"] !== undefined ? { time: t["time"] as string } : {}),
      ...(t["payee"] !== undefined ? { payee: t["payee"] as string } : {}),
      ...(t["note"] !== undefined ? { note: t["note"] as string } : {}),
      lines,
      total: lines.reduce((sum, l) => sum + l.amount, 0),
    };
  }

  async function commit(ops: readonly Op[]) {
    const fresh: Op[] = [];
    const queued = new Set<string>();
    for (const op of ops) {
      if (seen.has(op.id) || queued.has(op.id)) continue;
      queued.add(op.id);
      fresh.push(op);
    }
    await storage.append(fresh);
    for (const op of fresh) {
      fold(op);
      // Later local edits must order after anything received, even from a fast clock.
      if (compareHlc(op.hlc, last) > 0)
        last = { wall: op.hlc.wall, counter: op.hlc.counter, device: deviceId };
    }
  }

  return {
    async recordTransaction(input) {
      assertDate(input.date);
      if (input.time !== undefined) assertTime(input.time);
      if (input.lines.length === 0) throw new Error("A Transaction needs at least one Line");
      for (const line of input.lines) assertAmount(line.amount);
      const id = newUuidV7(clock, random);
      const ops: Op[] = [];
      for (const field of ["accountId", "date", "time", "payee", "note"] as const) {
        const value = input[field];
        if (value !== undefined) ops.push(makeOp("transaction", id, field, value));
      }
      for (const line of input.lines) {
        const lineId = newUuidV7(clock, random);
        ops.push(makeOp("line", lineId, "transactionId", id));
        ops.push(makeOp("line", lineId, "categoryId", line.categoryId));
        ops.push(makeOp("line", lineId, "amount", line.amount));
        if (line.itemName !== undefined)
          ops.push(makeOp("line", lineId, "itemName", line.itemName));
      }
      await commit(ops);
      return toTransaction(id)!;
    },
    async editTransaction(id, patch) {
      if (patch.date !== undefined) assertDate(patch.date);
      if (patch.time !== undefined) assertTime(patch.time);
      const ops: Op[] = [];
      for (const field of ["accountId", "date", "time", "payee", "note"] as const) {
        const value = patch[field];
        if (value !== undefined) ops.push(makeOp("transaction", id, field, value));
      }
      await commit(ops);
    },
    async editLine(transactionId, lineId, patch) {
      const line = read("line", lineId);
      if (!line || line["transactionId"] !== transactionId) {
        throw new Error(`Line ${lineId} does not belong to Transaction ${transactionId}`);
      }
      if (patch.amount !== undefined) assertAmount(patch.amount);
      const ops: Op[] = [];
      for (const field of ["categoryId", "amount", "itemName"] as const) {
        const value = patch[field];
        if (value !== undefined) ops.push(makeOp("line", lineId, field, value));
      }
      await commit(ops);
    },
    async exportOps() {
      return storage.readAll();
    },
    async applyOps(ops) {
      await commit(ops);
    },
    async deleteTransaction(id) {
      await commit([makeOp("transaction", id, "deletedAt", clock.now())]);
    },
    async getTransaction(id) {
      return toTransaction(id);
    },
    async listTransactions() {
      const out: Transaction[] = [];
      for (const k of records.keys()) {
        if (!k.startsWith("transaction:")) continue;
        const t = toTransaction(k.slice(12));
        if (t) out.push(t);
      }
      return out.sort((a, b) =>
        a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1,
      );
    },
  };
}
