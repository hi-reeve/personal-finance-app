import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function setup() {
  const clock = createManualClock(NOW);
  const engine = await createEngine({
    deviceId: "dev-a",
    clock,
    random: createSeededRandom(1),
    store: createMemoryStore(),
  });
  const account = await engine.createAccount({
    name: "Dompet",
    kind: "cash",
    currency: "IDR",
    openingBalance: 500_000,
  });
  const groceries = await engine.createCategory({ name: "Groceries", kind: "expense" });
  const household = await engine.createCategory({ name: "Household", kind: "expense" });
  const tx = await engine.recordTransaction({
    accountId: account.id,
    date: "2026-10-18",
    payee: "Supermarket",
    lines: [
      { categoryId: groceries.id, amount: -80_000, itemName: "Rice" },
      { categoryId: household.id, amount: -20_000, itemName: "Soap" },
    ],
  });
  return { engine, clock, account, groceries, household, tx };
}

describe("a Transaction with several Lines", () => {
  it("keeps each Line under its own Category and derives the total", async () => {
    const { engine, account, groceries, household, tx } = await setup();
    expect(tx.total).toBe(-100_000);
    expect(tx.lines.map((l) => [l.categoryId, l.amount, l.itemName])).toEqual([
      [groceries.id, -80_000, "Rice"],
      [household.id, -20_000, "Soap"],
    ]);
    expect(await engine.getBalance(account.id)).toBe(400_000);
  });

  it("counts every Line under its own Category, and the total is always their sum", async () => {
    const { engine, groceries, household, account } = await setup();
    await engine.recordTransaction({
      accountId: account.id,
      date: "2026-10-19",
      lines: [{ categoryId: groceries.id, amount: -5_000 }],
    });

    const perCategory = new Map<string, number>();
    for (const tx of await engine.listTransactions()) {
      expect(tx.total).toBe(tx.lines.reduce((sum, line) => sum + line.amount, 0));
      for (const line of tx.lines)
        perCategory.set(line.categoryId, (perCategory.get(line.categoryId) ?? 0) + line.amount);
    }
    expect(Object.fromEntries(perCategory)).toEqual({
      [groceries.id]: -85_000,
      [household.id]: -20_000,
    });
  });

  it("adds, removes and recategorises Lines in one write and the total follows", async () => {
    const { engine, account, groceries, household, tx } = await setup();
    const [rice, soap] = tx.lines;
    const fuel = await engine.createCategory({ name: "Fuel", kind: "expense" });

    const updated = await engine.updateTransaction(tx.id, { payee: "Mart" }, [
      { id: rice!.id, categoryId: household.id, amount: -70_000 }, // recategorised, cheaper
      { categoryId: fuel.id, amount: -30_000 }, // added
      // soap removed
    ]);

    expect(updated.payee).toBe("Mart");
    expect(updated.lines.map((l) => [l.categoryId, l.amount])).toEqual([
      [household.id, -70_000],
      [fuel.id, -30_000],
    ]);
    expect(updated.lines.some((l) => l.id === soap!.id)).toBe(false);
    expect(updated.total).toBe(-100_000);
    expect(await engine.getBalance(account.id)).toBe(400_000);
    expect(groceries.id).not.toBe(household.id);
  });

  it("clears an item name with an empty string", async () => {
    const { engine, tx } = await setup();
    const [rice, soap] = tx.lines;
    const updated = await engine.updateTransaction(tx.id, {}, [
      { id: rice!.id, categoryId: rice!.categoryId, amount: rice!.amount, itemName: "" },
      { id: soap!.id, categoryId: soap!.categoryId, amount: soap!.amount },
    ]);
    expect(updated.lines[0]!.itemName).toBeUndefined();
    expect(updated.lines[1]!.itemName).toBe("Soap");
  });

  it("needs at least one Line, and a Line that belongs to it", async () => {
    const { engine, tx, groceries } = await setup();
    await expect(engine.updateTransaction(tx.id, {}, [])).rejects.toThrow(/at least one/i);
    await expect(
      engine.updateTransaction(tx.id, {}, [
        { id: "someone-elses", categoryId: groceries.id, amount: -1 },
      ]),
    ).rejects.toThrow(/belong/i);
  });

  it("rejects the same Line twice", async () => {
    const { engine, tx } = await setup();
    const line = tx.lines[0]!;
    await expect(
      engine.updateTransaction(tx.id, {}, [
        { id: line.id, categoryId: line.categoryId, amount: -1 },
        { id: line.id, categoryId: line.categoryId, amount: -2 },
      ]),
    ).rejects.toThrow(/more than once/i);
  });

  it("changes nothing when any part is invalid", async () => {
    const { engine, tx, groceries } = await setup();
    const before = await engine.getTransaction(tx.id);
    await expect(
      engine.updateTransaction(tx.id, { payee: "Changed" }, [
        { id: tx.lines[0]!.id, categoryId: groceries.id, amount: -5 },
        { categoryId: groceries.id, amount: 1.5 },
      ]),
    ).rejects.toThrow();
    await expect(
      engine.updateTransaction(tx.id, { date: "2026-02-30" }, [
        { id: tx.lines[0]!.id, categoryId: groceries.id, amount: -5 },
      ]),
    ).rejects.toThrow();
    expect(await engine.getTransaction(tx.id)).toEqual(before);
  });

  it("rejects an unknown or deleted Transaction", async () => {
    const { engine, tx, groceries } = await setup();
    const line = [{ categoryId: groceries.id, amount: -1 }];
    await expect(engine.updateTransaction("nope", {}, line)).rejects.toThrow();
    await engine.deleteTransaction(tx.id);
    await expect(engine.updateTransaction(tx.id, {}, line)).rejects.toThrow();
  });

  it("a removed Line stays out after another device merges the log", async () => {
    const { engine, tx, groceries } = await setup();
    const other = await createEngine({
      deviceId: "dev-b",
      clock: createManualClock(NOW),
      random: createSeededRandom(2),
      store: createMemoryStore(),
    });
    await engine.updateTransaction(tx.id, {}, [
      { id: tx.lines[0]!.id, categoryId: groceries.id, amount: -80_000 },
    ]);
    await other.applyOps(await engine.exportOps());
    expect((await other.getTransaction(tx.id))!.lines).toHaveLength(1);
    expect((await other.getTransaction(tx.id))!.total).toBe(-80_000);
  });
});
