import { describe, expect, it } from "vite-plus/test";
import { BALANCE_ADJUSTMENT_CATEGORY, createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function device(store = createMemoryStore(), id = "dev-a") {
  const engine = await createEngine({
    deviceId: id,
    clock: createManualClock(NOW),
    random: createSeededRandom(id === "dev-a" ? 1 : 2),
    store,
  });
  return { engine, store };
}

/** A month of mixed activity in rupiah, plus one US dollar card. */
async function october() {
  const { engine, store } = await device();
  const cash = await engine.completeSetup({
    baseCurrency: "IDR",
    account: { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 },
  });
  const card = await engine.createAccount({
    name: "Wise",
    kind: "bank",
    currency: "USD",
    openingBalance: 500_000,
  });
  const food = await engine.createCategory({ name: "Food", kind: "expense" });
  const groceries = await engine.createCategory({
    name: "Groceries",
    kind: "expense",
    parentId: food.id,
  });
  const eatingOut = await engine.createCategory({
    name: "Eating out",
    kind: "expense",
    parentId: food.id,
  });
  const fuel = await engine.createCategory({ name: "Fuel", kind: "expense" });
  const fees = await engine.createCategory({ name: "Bank fees", kind: "expense" });
  const salary = await engine.createCategory({ name: "Salary", kind: "income" });

  const spend = (accountId: string, date: string, lines: [string, number][], rate?: string) =>
    engine.recordTransaction({
      accountId,
      date,
      ...(rate ? { rate } : {}),
      lines: lines.map(([categoryId, amount]) => ({ categoryId, amount })),
    });

  // One receipt split over two Categories.
  await spend(cash.id, "2026-10-05", [
    [groceries.id, -80_000],
    [fuel.id, -20_000],
  ]);
  await spend(cash.id, "2026-10-06", [[eatingOut.id, -50_000]]);
  // $10.00 on the card at 16,000 per dollar, straight into Food.
  await spend(card.id, "2026-10-07", [[food.id, -1_000]], "16000");
  // A refund reduces what Groceries cost.
  await spend(cash.id, "2026-10-08", [[groceries.id, 10_000]]);
  // Moving money is not spending; only its fee is.
  await engine.recordTransfer({
    date: "2026-10-09",
    fromAccountId: cash.id,
    toAccountId: card.id,
    fromAmount: 1_600_000,
    toAmount: 10_000,
    fee: { amount: 5_000, categoryId: fees.id },
  });
  await engine.adjustBalance(cash.id, { target: 123, date: "2026-10-10" });
  await spend(cash.id, "2026-10-25", [[salary.id, 10_000_000]]);
  // Outside the month, and a deleted one.
  await spend(cash.id, "2026-09-30", [[fuel.id, -999_999]]);
  const gone = await spend(cash.id, "2026-10-11", [[fuel.id, -777_777]]);
  await engine.deleteTransaction(gone.id);
  return { engine, store, cash, card, food, groceries, eatingOut, fuel, fees, salary };
}

const period = { from: "2026-10-01", to: "2026-10-31" };

describe("spending by category", () => {
  it("counts only spending: Transfers, balance adjustments, the past and deletions stay out", async () => {
    const { engine, food, fuel, fees } = await october();
    const report = await engine.spendingByCategory(period);

    expect(report).toMatchObject({ currency: "IDR", kind: "expense", ...period });
    // Food 280,000 + Fuel 20,000 + Bank fees 5,000
    expect(report.total).toBe(305_000);
    expect(report.categories.map((c) => [c.categoryId, c.total])).toEqual([
      [food.id, 280_000],
      [fuel.id, 20_000],
      [fees.id, 5_000],
    ]);
  });

  it("drills down: a parent adds up its children and its own Lines", async () => {
    const { engine, food, groceries, eatingOut } = await october();
    const [top] = (await engine.spendingByCategory(period)).categories;

    expect(top).toMatchObject({ categoryId: food.id, name: "Food", total: 280_000, own: 160_000 });
    // Groceries is net of the refund: 80,000 - 10,000.
    expect(top!.children.map((c) => [c.name, c.total, c.own, c.children])).toEqual([
      ["Groceries", 70_000, 70_000, []],
      ["Eating out", 50_000, 50_000, []],
    ]);
    expect(top!.children.map((c) => c.categoryId)).toEqual([groceries.id, eatingOut.id]);
  });

  it("shows each Category's share, and the top level adds up to exactly 100%", async () => {
    const { engine } = await october();
    const { categories } = await engine.spendingByCategory(period);
    expect(categories.map((c) => c.share)).toEqual([9_180, 656, 164]);
    expect(categories.reduce((sum, c) => sum + c.share, 0)).toBe(10_000);
    // Children are shares of the whole report, not of their parent.
    expect(categories[0]!.children.map((c) => c.share)).toEqual([2_295, 1_639]);
  });

  it("counts each Line under its own Category, even in a split", async () => {
    const { engine, fuel } = await october();
    const { categories } = await engine.spendingByCategory({
      from: "2026-10-05",
      to: "2026-10-05",
    });
    expect(categories.map((c) => [c.name, c.total])).toEqual([
      ["Food", 80_000],
      ["Fuel", 20_000],
    ]);
    expect(categories[1]!.categoryId).toBe(fuel.id);
  });

  it("reports income on its own", async () => {
    const { engine, salary } = await october();
    const report = await engine.spendingByCategory({ ...period, kind: "income" });
    expect(report.kind).toBe("income");
    expect(report.total).toBe(10_000_000);
    expect(report.categories).toMatchObject([
      { categoryId: salary.id, total: 10_000_000, share: 10_000 },
    ]);
  });

  it("limits to the period, both days included", async () => {
    const { engine } = await october();
    expect((await engine.spendingByCategory({ from: "2026-10-06", to: "2026-10-07" })).total).toBe(
      210_000,
    );
    expect(
      (await engine.spendingByCategory({ from: "2026-11-01", to: "2026-11-30" })).categories,
    ).toEqual([]);
  });
});

describe("other currencies", () => {
  it("converts each Line at its Transaction's own frozen rate", async () => {
    const { engine, food } = await october();
    const [top] = (await engine.spendingByCategory(period)).categories;
    // The $10.00 at 16,000 is Rp 160,000 in Food itself.
    expect(top!.own).toBe(160_000);
    expect(top!.categoryId).toBe(food.id);
  });

  it("never changes a past period when later Transactions use a different rate", async () => {
    const { engine, card, food } = await october();
    const before = await engine.spendingByCategory(period);
    await engine.recordTransaction({
      accountId: card.id,
      date: "2026-11-02",
      rate: "20000", // the dollar jumped
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    expect(await engine.spendingByCategory(period)).toEqual(before);
    expect((await engine.spendingByCategory({ from: "2026-11-01", to: "2026-11-30" })).total).toBe(
      200_000,
    );
  });

  it("rounds per Line, the same way every other figure does", async () => {
    const { engine, card, food, fuel } = await october();
    await engine.recordTransaction({
      accountId: card.id,
      date: "2026-12-01",
      rate: "16250.5",
      lines: [
        { categoryId: food.id, amount: -1_200 },
        { categoryId: fuel.id, amount: -300 },
      ],
    });
    const report = await engine.spendingByCategory({ from: "2026-12-01", to: "2026-12-31" });
    expect(report.categories.map((c) => [c.name, c.total])).toEqual([
      ["Food", 195_006],
      ["Fuel", 48_752],
    ]);
    expect(report.total).toBe(243_758);
  });

  it("leaves out, and counts, Lines it cannot convert", async () => {
    const { engine, store, card } = await october();
    // The same data an old build wrote: a foreign Transaction with no rate.
    const oldOps = (await store.readAll()).filter((op) => op.field !== "rate");
    const { engine: old } = await device(createMemoryStore(), "dev-c");
    await old.applyOps(oldOps);
    const report = await old.spendingByCategory(period);
    expect(report.skipped).toEqual({ lines: 1 });
    expect(report.total).toBe(145_000); // Food without the unconvertible $10, plus Fuel and fees
    expect(card.currency).toBe("USD");
    expect((await engine.spendingByCategory(period)).skipped).toEqual({ lines: 0 });
  });
});

describe("odd data", () => {
  it("shows a Line whose Category no longer exists as its own entry", async () => {
    const { engine, cash } = await october();
    await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-10-12",
      lines: [{ categoryId: "ghost", amount: -3_000 }],
    });
    const { categories, total } = await engine.spendingByCategory(period);
    expect(total).toBe(308_000);
    expect(categories.find((c) => c.categoryId === "ghost")).toMatchObject({
      total: 3_000,
      missing: true,
    });
  });

  it("keeps merged Categories together", async () => {
    const { engine, fuel, fees } = await october();
    await engine.mergeCategory(fees.id, fuel.id);
    const { categories } = await engine.spendingByCategory(period);
    expect(categories.find((c) => c.categoryId === fuel.id)!.total).toBe(25_000);
    expect(categories.find((c) => c.categoryId === fees.id)).toBeUndefined();
  });

  it("never counts the Balance adjustment Category, however it got there", async () => {
    const { engine, cash } = await october();
    // A Transaction typed into that Category by any other route is still left out.
    await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-10-12",
      lines: [{ categoryId: BALANCE_ADJUSTMENT_CATEGORY, amount: -50_000 }],
    });
    expect((await engine.spendingByCategory(period)).total).toBe(305_000);
  });

  it("gives a Category whose refunds outweigh its spending no share and keeps the rest at 100%", async () => {
    const { engine, cash, fuel } = await october();
    await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-10-13",
      lines: [{ categoryId: fuel.id, amount: 50_000 }], // a refund bigger than the 20,000 spent
    });
    const { categories, total } = await engine.spendingByCategory(period);
    expect(total).toBe(255_000);
    const byName = Object.fromEntries(categories.map((c) => [c.name, c]));
    expect(byName["Fuel"]).toMatchObject({ total: -30_000, share: 0 });
    expect(categories.reduce((sum, c) => sum + c.share, 0)).toBe(10_000);
  });

  it("shows a Category whose parent is of the other kind at the top, so no figure is lost", async () => {
    const { engine, cash } = await october();
    const pay = await engine.createCategory({ name: "Pay", kind: "income" });
    const side = await engine.createCategory({ name: "Side", kind: "expense" });
    await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-10-14",
      lines: [{ categoryId: side.id, amount: -1_000 }],
    });
    // Another device moved it under an income Category before the two kinds were checked.
    const { engine: other } = await device(createMemoryStore(), "dev-b");
    await other.applyOps(await engine.exportOps());
    await other.applyOps([
      {
        id: "forced-move",
        hlc: { wall: NOW + 10_000, counter: 0, device: "dev-b" },
        entity: "category",
        recordId: side.id,
        field: "parentId",
        value: pay.id,
      },
    ]);
    const report = await other.spendingByCategory(period);
    expect(report.total).toBe(306_000);
    expect(report.categories.some((c) => c.categoryId === side.id)).toBe(true);
  });

  it("never shows a child with more share than its parent, and splits a parent's share exactly", async () => {
    const { engine } = await october();
    const walk = (nodes: Awaited<ReturnType<typeof engine.spendingByCategory>>["categories"]) => {
      for (const node of nodes) {
        const inside = node.children.reduce((sum, child) => sum + child.share, 0);
        expect(inside).toBeLessThanOrEqual(node.share);
        walk(node.children);
      }
    };
    walk((await engine.spendingByCategory(period)).categories);
  });

  it("rejects a period that is not two plain dates in order", async () => {
    const { engine } = await device();
    await expect(
      engine.spendingByCategory({ from: "2026-10-31", to: "2026-10-01" }),
    ).rejects.toThrow();
    await expect(engine.spendingByCategory({ from: "Oct", to: "2026-10-01" })).rejects.toThrow();
  });

  it("is empty, not broken, before anything is recorded or set up", async () => {
    const { engine } = await device();
    expect(await engine.spendingByCategory(period)).toMatchObject({
      total: 0,
      categories: [],
      skipped: { lines: 0 },
    });
  });

  it("gives the same answer on every device", async () => {
    const { engine } = await october();
    const { engine: other } = await device(createMemoryStore(), "dev-b");
    await other.applyOps(await engine.exportOps());
    expect(await other.spendingByCategory(period)).toEqual(await engine.spendingByCategory(period));
  });
});

describe("daily totals", () => {
  it("gives every day of the period, with the days nothing happened at zero", async () => {
    const { engine } = await october();
    const report = await engine.dailyTotals(period);
    expect(report).toMatchObject({ currency: "IDR", kind: "expense", ...period });
    expect(report.days).toHaveLength(31);
    expect(report.days[0]).toEqual({ date: "2026-10-01", total: 0 });
    const byDate = Object.fromEntries(report.days.map((d) => [d.date, d.total]));
    expect(byDate["2026-10-05"]).toBe(100_000); // a split receipt: both Lines
    expect(byDate["2026-10-06"]).toBe(50_000);
    expect(byDate["2026-10-07"]).toBe(160_000); // $10.00 at its frozen 16,000
    expect(byDate["2026-10-08"]).toBe(-10_000); // a refund day
    expect(byDate["2026-10-09"]).toBe(5_000); // the Transfer's fee, not the Transfer
    expect(byDate["2026-10-10"]).toBe(0); // the balance adjustment is left out
  });

  it("always agrees with the by-Category report", async () => {
    const { engine } = await october();
    for (const kind of ["expense", "income"] as const) {
      const daily = await engine.dailyTotals({ ...period, kind });
      const byCategory = await engine.spendingByCategory({ ...period, kind });
      expect(daily.total).toBe(byCategory.total);
      expect(daily.days.reduce((sum, d) => sum + d.total, 0)).toBe(byCategory.total);
    }
  });

  it("reports income, narrows to a sub-period, and counts what it cannot convert", async () => {
    const { engine } = await october();
    const income = await engine.dailyTotals({ ...period, kind: "income" });
    expect(income.days.find((d) => d.total !== 0)).toEqual({
      date: "2026-10-25",
      total: 10_000_000,
    });
    const week = await engine.dailyTotals({ from: "2026-10-05", to: "2026-10-07" });
    expect(week.days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(week.skipped).toEqual({ lines: 0 });
  });

  it("is zero everywhere, not broken, before anything is recorded", async () => {
    const { engine } = await device();
    const empty = await engine.dailyTotals({ from: "2026-10-01", to: "2026-10-03" });
    expect(empty.total).toBe(0);
    expect(empty.days).toEqual([]);
  });
});
