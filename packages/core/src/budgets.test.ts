import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;
const october = { from: "2026-10-01", to: "2026-10-31" };

async function device(store = createMemoryStore(), id = "dev-a") {
  const clock = createManualClock(NOW);
  const engine = await createEngine({
    deviceId: id,
    clock,
    random: createSeededRandom(id === "dev-a" ? 1 : 2),
    store,
  });
  return { engine, clock, store };
}

async function month() {
  const { engine, clock, store } = await device();
  const cash = await engine.completeSetup({
    baseCurrency: "IDR",
    account: { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 },
  });
  const card = await engine.createAccount({
    name: "Wise",
    kind: "bank",
    currency: "USD",
    openingBalance: 0,
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
  const rent = await engine.createCategory({ name: "Rent", kind: "expense" });
  const salary = await engine.createCategory({ name: "Salary", kind: "income" });
  const spend = (
    accountId: string,
    categoryId: string,
    amount: number,
    date = "2026-10-10",
    rate?: string,
  ) =>
    engine.recordTransaction({
      accountId,
      date,
      ...(rate ? { rate } : {}),
      lines: [{ categoryId, amount }],
    });
  return {
    engine,
    clock,
    store,
    cash,
    card,
    food,
    groceries,
    eatingOut,
    fuel,
    rent,
    salary,
    spend,
  };
}

const byName = (
  progress: Awaited<ReturnType<Awaited<ReturnType<typeof month>>["engine"]["budgetProgress"]>>,
) => Object.fromEntries(progress.map((p) => [p.name, p]));

describe("category budgets", () => {
  it("count what a Category and everything inside it spent", async () => {
    const { engine, cash, food, groceries, eatingOut, spend } = await month();
    await engine.setBudget(food.id, 500_000);
    await spend(cash.id, groceries.id, -200_000);
    await spend(cash.id, eatingOut.id, -150_000);
    await spend(cash.id, food.id, -50_000);

    const [progress] = await engine.budgetProgress(october);
    expect(progress).toMatchObject({
      categoryId: food.id,
      name: "Food",
      amount: 500_000,
      spent: 400_000,
      remaining: 100_000,
      used: 8_000,
    });
  });

  it("has three states: on track, near the limit at 80% by default, and over", async () => {
    const { engine, cash, food, fuel, rent, spend } = await month();
    await engine.setBudget(rent.id, 1_000_000);
    await engine.setBudget(food.id, 500_000);
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, rent.id, -100_000); // 10%
    await spend(cash.id, food.id, -400_000); // exactly 80%
    await spend(cash.id, fuel.id, -120_000); // 120%

    const progress = byName(await engine.budgetProgress(october));
    expect(progress["Rent"]).toMatchObject({ state: "on-track", used: 1_000 });
    expect(progress["Food"]).toMatchObject({ state: "near", used: 8_000 });
    expect(progress["Fuel"]).toMatchObject({ state: "over", used: 12_000, remaining: -20_000 });
  });

  it("is on track just under the line, near at the limit itself, and over only above it", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, fuel.id, -79_999);
    expect((await engine.budgetProgress(october))[0]!.state).toBe("on-track");
    await spend(cash.id, fuel.id, -20_001); // exactly 100,000
    expect((await engine.budgetProgress(october))[0]).toMatchObject({
      state: "near",
      remaining: 0,
    });
    await spend(cash.id, fuel.id, -1);
    expect((await engine.budgetProgress(october))[0]!.state).toBe("over");
  });

  it("move the near-limit line when the setting changes, and keep it a whole percent", async () => {
    const { engine, cash, food, spend } = await month();
    await engine.setBudget(food.id, 500_000);
    await spend(cash.id, food.id, -400_000);
    expect((await engine.budgetProgress(october))[0]!.state).toBe("near");

    await engine.setPreferences({ budgetNearLimit: 90 });
    expect(engine.getSettings().budgetNearLimit).toBe(90);
    expect((await engine.budgetProgress(october))[0]!.state).toBe("on-track");

    for (const bad of [0, 100, 150, -5, 80.5, Number.NaN]) {
      await expect(engine.setPreferences({ budgetNearLimit: bad }), String(bad)).rejects.toThrow();
    }
    expect(engine.getSettings().budgetNearLimit).toBe(90);
  });

  it("judge the state on exact amounts even when they are huge", async () => {
    const { engine, cash, fuel, spend } = await month();
    const limit = 9_000_000_000_000_000; // near the largest whole amount a safe integer holds
    await engine.setBudget(fuel.id, limit);
    await spend(cash.id, fuel.id, -(limit * 0.9 + 1));
    expect((await engine.budgetProgress(october))[0]!.state).toBe("near");
  });

  it("never block a Transaction, however far over", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 1_000);
    const tx = await spend(cash.id, fuel.id, -50_000_000);
    expect(tx.total).toBe(-50_000_000);
    expect((await engine.budgetProgress(october))[0]).toMatchObject({ state: "over" });
  });

  it("count base amounts, and ignore Transfers, balance adjustments and other months", async () => {
    const { engine, cash, card, fuel, spend } = await month();
    const fees = await engine.createCategory({ name: "Bank fees", kind: "expense" });
    await engine.setBudget(fuel.id, 1_000_000);
    await engine.setBudget(fees.id, 100_000);

    await spend(card.id, fuel.id, -1_000, "2026-10-12", "16000"); // $10.00 = Rp 160,000
    await engine.recordTransfer({
      date: "2026-10-13",
      fromAccountId: cash.id,
      toAccountId: card.id,
      fromAmount: 1_600_000,
      toAmount: 10_000,
      fee: { amount: 5_000, categoryId: fees.id },
    });
    await engine.adjustBalance(cash.id, { target: 777, date: "2026-10-14" });
    await spend(cash.id, fuel.id, -999_999, "2026-09-30");

    const progress = byName(await engine.budgetProgress(october));
    expect(progress["Fuel"]!.spent).toBe(160_000);
    // The Transfer itself is not spending, but its fee is.
    expect(progress["Bank fees"]!.spent).toBe(5_000);
    expect(
      byName(await engine.budgetProgress({ from: "2026-09-01", to: "2026-09-30" }))["Fuel"]!.spent,
    ).toBe(999_999);
  });

  it("are reduced by a refund", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, fuel.id, -60_000);
    await spend(cash.id, fuel.id, 10_000);
    expect((await engine.budgetProgress(october))[0]).toMatchObject({ spent: 50_000, used: 5_000 });
  });

  it("let a parent and a child each have their own, counting independently", async () => {
    const { engine, cash, food, groceries, spend } = await month();
    await engine.setBudget(food.id, 300_000);
    await engine.setBudget(groceries.id, 100_000);
    await spend(cash.id, groceries.id, -150_000);
    const progress = byName(await engine.budgetProgress(october));
    expect(progress["Food"]).toMatchObject({ spent: 150_000, state: "on-track" });
    expect(progress["Groceries"]).toMatchObject({ spent: 150_000, state: "over" });
  });

  it("show nothing for a Category with no budget, and zero spent for a quiet month", async () => {
    const { engine, food } = await month();
    expect(await engine.budgetProgress(october)).toEqual([]);
    await engine.setBudget(food.id, 500_000);
    expect((await engine.budgetProgress(october))[0]).toMatchObject({
      spent: 0,
      used: 0,
      state: "on-track",
    });
  });
});

describe("keeping budgets", () => {
  it("has one per Category: setting again changes it", async () => {
    const { engine, fuel } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await engine.setBudget(fuel.id, 250_000);
    expect(await engine.listBudgets()).toEqual([{ categoryId: fuel.id, amount: 250_000 }]);
  });

  it("can be removed, and brought back", async () => {
    const { engine, fuel } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await engine.removeBudget(fuel.id);
    expect(await engine.listBudgets()).toEqual([]);
    await expect(engine.removeBudget(fuel.id)).rejects.toThrow();
    await engine.setBudget(fuel.id, 300_000);
    expect(await engine.listBudgets()).toEqual([{ categoryId: fuel.id, amount: 300_000 }]);
  });

  it("only go on expense Categories, with a whole positive amount", async () => {
    const { engine, salary, fuel } = await month();
    await expect(engine.setBudget(salary.id, 100)).rejects.toThrow(/expense/i);
    await expect(engine.setBudget("ghost", 100)).rejects.toThrow();
    for (const bad of [0, -5, 1.5, Number.NaN]) {
      await expect(engine.setBudget(fuel.id, bad), String(bad)).rejects.toThrow();
    }
    expect(await engine.listBudgets()).toEqual([]);
  });

  it("follow a merged Category and disappear with a deleted one", async () => {
    const { engine, fuel, rent } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await engine.mergeCategory(fuel.id, rent.id);
    expect(await engine.listBudgets()).toEqual([{ categoryId: rent.id, amount: 100_000 }]);

    const gone = await engine.createCategory({ name: "Gone", kind: "expense" });
    await engine.setBudget(gone.id, 5_000);
    await engine.deleteCategory(gone.id);
    expect((await engine.listBudgets()).map((b) => b.categoryId)).toEqual([rent.id]);
  });

  it("merge from two devices, the later change winning, and survive a restart", async () => {
    const one = await month();
    const two = await device(undefined, "dev-b");
    await one.engine.setBudget(one.fuel.id, 100_000);
    await two.engine.applyOps(await one.engine.exportOps());

    two.clock.advance(1_000);
    await two.engine.setBudget(one.fuel.id, 400_000);
    await one.engine.applyOps(await two.engine.exportOps());

    for (const engine of [one.engine, two.engine]) {
      expect(await engine.listBudgets()).toEqual([{ categoryId: one.fuel.id, amount: 400_000 }]);
    }
    const restarted = await device(one.store);
    expect(await restarted.engine.listBudgets()).toEqual([
      { categoryId: one.fuel.id, amount: 400_000 },
    ]);
  });
});
