import { describe, expect, it } from "vite-plus/test";
import {
  filterActivity,
  type ActivityEntry,
  type Category,
  type Transaction,
  type Transfer,
} from "./index";

const cat = (id: string, name: string, kind: Category["kind"], parentId?: string): Category => ({
  id,
  name,
  kind,
  ...(parentId ? { parentId } : {}),
  createdAt: 0,
});

const categories = [
  cat("food", "Food", "expense"),
  cat("groceries", "Groceries", "expense", "food"),
  cat("fruit", "Fruit", "expense", "groceries"),
  cat("fuel", "Fuel", "expense"),
  cat("salary", "Salary", "income"),
];

let counter = 0;
function tx(
  over: Partial<Omit<Transaction, "lines" | "total">> & {
    lines: { categoryId: string; amount: number; itemName?: string }[];
  },
): ActivityEntry {
  counter += 1;
  const lines = over.lines.map((l, i) => ({ id: `l${counter}-${i}`, ...l }));
  return {
    kind: "transaction",
    transaction: {
      id: `t${counter}`,
      accountId: "cash",
      date: "2026-10-10",
      createdAt: counter,
      updatedAt: counter,
      ...over,
      lines,
      total: lines.reduce((sum, l) => sum + l.amount, 0),
    },
  };
}

function transfer(over: Partial<Transfer> = {}): ActivityEntry {
  counter += 1;
  return {
    kind: "transfer",
    transfer: {
      id: `x${counter}`,
      fromAccountId: "bank",
      toAccountId: "cash",
      date: "2026-10-12",
      fromAmount: 500_000,
      toAmount: 500_000,
      createdAt: counter,
      ...over,
    },
  };
}

const lunch = tx({
  payee: "Warung Tegal",
  note: "nasi goreng",
  date: "2026-10-05",
  lines: [{ categoryId: "food", amount: -25_000 }],
});
const shop = tx({
  payee: "Superindo",
  accountId: "bank",
  date: "2026-10-08",
  tagIds: ["trip"],
  lines: [
    { categoryId: "fruit", amount: -60_000, itemName: "Mangosteen" },
    { categoryId: "fuel", amount: -15_000, itemName: "Lighter fluid" },
  ],
});
const pay = tx({
  payee: "Acme",
  date: "2026-10-01",
  lines: [{ categoryId: "salary", amount: 9_000_000 }],
});
const move = transfer({ note: "top up wallet" });
const all = [lunch, shop, pay, move];

const run = (filter: Parameters<typeof filterActivity>[1]) =>
  filterActivity(all, filter, { categories });

describe("filterActivity", () => {
  it("returns everything for an empty filter, in the same order", () => {
    expect(run({})).toEqual(all);
  });

  describe("text", () => {
    it("finds payee, note and item names in any case", () => {
      expect(run({ text: "TEGAL" })).toEqual([lunch]);
      expect(run({ text: "goreng" })).toEqual([lunch]);
      expect(run({ text: "mangosteen" })).toEqual([shop]);
      expect(run({ text: "lighter" })).toEqual([shop]);
      expect(run({ text: "top up" })).toEqual([move]);
    });

    it("trims the text, and a blank text matches everything", () => {
      expect(run({ text: "  acme " })).toEqual([pay]);
      expect(run({ text: "   " })).toEqual(all);
      expect(run({ text: "no such thing" })).toEqual([]);
    });
  });

  it("limits by date, both ends included", () => {
    expect(run({ from: "2026-10-05", to: "2026-10-08" })).toEqual([lunch, shop]);
    expect(run({ from: "2026-10-09" })).toEqual([move]);
    expect(run({ to: "2026-10-01" })).toEqual([pay]);
  });

  it("limits by Account; a Transfer belongs to both of its Accounts", () => {
    expect(run({ accountIds: ["bank"] })).toEqual([shop, move]);
    expect(run({ accountIds: ["cash"] })).toEqual([lunch, pay, move]);
    expect(run({ accountIds: ["bank", "cash"] })).toEqual(all);
  });

  describe("Category", () => {
    it("includes descendants, and a Line anywhere in a split counts", () => {
      expect(run({ categoryIds: ["food"] })).toEqual([lunch, shop]);
      expect(run({ categoryIds: ["groceries"] })).toEqual([shop]);
      expect(run({ categoryIds: ["fuel"] })).toEqual([shop]);
      expect(run({ categoryIds: ["fruit", "salary"] })).toEqual([shop, pay]);
    });

    it("leaves Transfers out when a Category is chosen", () => {
      expect(run({ categoryIds: ["food", "salary", "fuel"] })).not.toContain(move);
    });

    it("an unknown Category matches nothing", () => {
      expect(run({ categoryIds: ["missing"] })).toEqual([]);
    });
  });

  it("limits by Tag and leaves Transfers out", () => {
    expect(run({ tagIds: ["trip"] })).toEqual([shop]);
    expect(run({ tagIds: ["other"] })).toEqual([]);
  });

  it("limits by kind", () => {
    expect(run({ kind: "expense" })).toEqual([lunch, shop]);
    expect(run({ kind: "income" })).toEqual([pay]);
    expect(run({ kind: "transfer" })).toEqual([move]);
  });

  it("limits by amount using the size of the Transaction, whichever way it goes", () => {
    expect(run({ minAmount: 50_000, maxAmount: 100_000 })).toEqual([shop]);
    expect(run({ minAmount: 1_000_000 })).toEqual([pay]);
    expect(run({ maxAmount: 25_000 })).toEqual([lunch]);
    expect(run({ minAmount: 500_000, maxAmount: 500_000 })).toEqual([move]);
  });

  it("combines filters: every one must match", () => {
    expect(run({ kind: "expense", accountIds: ["bank"], text: "super" })).toEqual([shop]);
    expect(run({ kind: "income", accountIds: ["bank"] })).toEqual([]);
    expect(run({ categoryIds: ["food"], from: "2026-10-06" })).toEqual([shop]);
  });

  it("keeps up with a large list", () => {
    const big: ActivityEntry[] = [];
    for (let i = 0; i < 20_000; i += 1)
      big.push(
        tx({
          payee: `Shop ${i}`,
          date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
          lines: [{ categoryId: i % 2 ? "fruit" : "fuel", amount: -(i + 1) }],
        }),
      );
    const started = Date.now();
    const found = filterActivity(
      big,
      { text: "shop 1", categoryIds: ["food"], from: "2026-03-01", minAmount: 100 },
      { categories },
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(found.length).toBeGreaterThan(0);
  });
});
