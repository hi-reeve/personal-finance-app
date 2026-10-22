import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore, thresholdCrossings } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;
const october = "2026-10-15";

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

type Engine = Awaited<ReturnType<typeof month>>["engine"];
type Progress = Awaited<ReturnType<Engine["budgetProgress"]>>["categories"];

const MONTHLY = (categoryId: string, amount: number) => ({
  categoryId,
  amount,
  period: "month",
  carryOver: false,
});

const byName = (progress: Progress) => Object.fromEntries(progress.map((p) => [p.name, p]));

/** How the Category budgets stand on a day. */
const standing = async (engine: Engine, on: string) => (await engine.budgetProgress(on)).categories;

describe("category budgets", () => {
  it("count what a Category and everything inside it spent", async () => {
    const { engine, cash, food, groceries, eatingOut, spend } = await month();
    await engine.setBudget(food.id, 500_000);
    await spend(cash.id, groceries.id, -200_000);
    await spend(cash.id, eatingOut.id, -150_000);
    await spend(cash.id, food.id, -50_000);

    const [progress] = await standing(engine, october);
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

    const progress = byName(await standing(engine, october));
    expect(progress["Rent"]).toMatchObject({ state: "on-track", used: 1_000 });
    expect(progress["Food"]).toMatchObject({ state: "near", used: 8_000 });
    expect(progress["Fuel"]).toMatchObject({ state: "over", used: 12_000, remaining: -20_000 });
  });

  it("is on track just under the line, near at the limit itself, and over only above it", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, fuel.id, -79_999);
    expect((await standing(engine, october))[0]!.state).toBe("on-track");
    await spend(cash.id, fuel.id, -20_001); // exactly 100,000
    expect((await standing(engine, october))[0]).toMatchObject({
      state: "near",
      remaining: 0,
    });
    await spend(cash.id, fuel.id, -1);
    expect((await standing(engine, october))[0]!.state).toBe("over");
  });

  it("move the near-limit line when the setting changes, and keep it a whole percent", async () => {
    const { engine, cash, food, spend } = await month();
    await engine.setBudget(food.id, 500_000);
    await spend(cash.id, food.id, -400_000);
    expect((await standing(engine, october))[0]!.state).toBe("near");

    await engine.setPreferences({ budgetNearLimit: 90 });
    expect(engine.getSettings().budgetNearLimit).toBe(90);
    expect((await standing(engine, october))[0]!.state).toBe("on-track");

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
    expect((await standing(engine, october))[0]!.state).toBe("near");
  });

  it("never block a Transaction, however far over", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 1_000);
    const tx = await spend(cash.id, fuel.id, -50_000_000);
    expect(tx.total).toBe(-50_000_000);
    expect((await standing(engine, october))[0]).toMatchObject({ state: "over" });
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

    const progress = byName(await standing(engine, october));
    expect(progress["Fuel"]!.spent).toBe(160_000);
    // The Transfer itself is not spending, but its fee is.
    expect(progress["Bank fees"]!.spent).toBe(5_000);
    expect(byName(await standing(engine, "2026-09-15"))["Fuel"]!.spent).toBe(999_999);
  });

  it("are reduced by a refund", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, fuel.id, -60_000);
    await spend(cash.id, fuel.id, 10_000);
    expect((await standing(engine, october))[0]).toMatchObject({ spent: 50_000, used: 5_000 });
  });

  it("let a parent and a child each have their own, counting independently", async () => {
    const { engine, cash, food, groceries, spend } = await month();
    await engine.setBudget(food.id, 300_000);
    await engine.setBudget(groceries.id, 100_000);
    await spend(cash.id, groceries.id, -150_000);
    const progress = byName(await standing(engine, october));
    expect(progress["Food"]).toMatchObject({ spent: 150_000, state: "on-track" });
    expect(progress["Groceries"]).toMatchObject({ spent: 150_000, state: "over" });
  });

  it("show nothing for a Category with no budget, and zero spent for a quiet month", async () => {
    const { engine, food } = await month();
    expect(await standing(engine, october)).toEqual([]);
    await engine.setBudget(food.id, 500_000);
    expect((await standing(engine, october))[0]).toMatchObject({
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
    expect(await engine.listBudgets()).toEqual([MONTHLY(fuel.id, 250_000)]);
  });

  it("can be removed, and brought back", async () => {
    const { engine, fuel } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await engine.removeBudget(fuel.id);
    expect(await engine.listBudgets()).toEqual([]);
    await expect(engine.removeBudget(fuel.id)).rejects.toThrow();
    await engine.setBudget(fuel.id, 300_000);
    expect(await engine.listBudgets()).toEqual([MONTHLY(fuel.id, 300_000)]);
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
    expect(await engine.listBudgets()).toEqual([MONTHLY(rent.id, 100_000)]);

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
      expect(await engine.listBudgets()).toEqual([MONTHLY(one.fuel.id, 400_000)]);
    }
    const restarted = await device(one.store);
    expect(await restarted.engine.listBudgets()).toEqual([MONTHLY(one.fuel.id, 400_000)]);
  });
});

describe("budget periods", () => {
  it("start on the first of the month unless a start day is chosen, to line up with payday", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, fuel.id, -10_000, "2026-10-20");
    await spend(cash.id, fuel.id, -30_000, "2026-10-26");
    expect((await standing(engine, "2026-10-26"))[0]).toMatchObject({
      range: { from: "2026-10-01", to: "2026-10-31" },
      spent: 40_000,
    });

    await engine.setPreferences({ budgetStartDay: 25 });
    expect(engine.getSettings().budgetStartDay).toBe(25);
    expect((await standing(engine, "2026-10-26"))[0]).toMatchObject({
      range: { from: "2026-10-25", to: "2026-11-24" },
      spent: 30_000,
    });
    expect((await standing(engine, "2026-10-20"))[0]).toMatchObject({
      range: { from: "2026-09-25", to: "2026-10-24" },
      spent: 10_000,
    });
    // The start day moves the period but never what a Transaction recorded.
    expect((await standing(engine, "2026-10-24"))[0]!.range.to).toBe("2026-10-24");
  });

  it("only allow a start day every month has, as a whole number", async () => {
    const { engine } = await month();
    for (const bad of [0, 29, 31, -1, 2.5, Number.NaN]) {
      await expect(engine.setPreferences({ budgetStartDay: bad }), String(bad)).rejects.toThrow();
    }
    await engine.setPreferences({ budgetStartDay: 28 });
    expect(engine.getSettings().budgetStartDay).toBe(28);
  });

  it("can be weekly, from Monday, or yearly", async () => {
    const { engine, cash, fuel, rent, spend } = await month();
    await engine.setBudget(fuel.id, 100_000, { period: "week" });
    await engine.setBudget(rent.id, 12_000_000, { period: "year" });
    await spend(cash.id, fuel.id, -20_000, "2026-10-12");
    await spend(cash.id, fuel.id, -5_000, "2026-10-19");
    await spend(cash.id, rent.id, -1_000_000, "2026-02-01");
    await spend(cash.id, rent.id, -1_000_000, "2026-10-01");

    const progress = byName(await standing(engine, "2026-10-14"));
    expect(progress["Fuel"]).toMatchObject({
      period: "week",
      range: { from: "2026-10-12", to: "2026-10-18" },
      spent: 20_000,
    });
    expect(progress["Rent"]).toMatchObject({
      period: "year",
      range: { from: "2026-01-01", to: "2026-12-31" },
      spent: 2_000_000,
    });
  });

  it("keep a budget and the budgets above or inside it on the same period", async () => {
    const { engine, food, groceries, fuel } = await month();
    await engine.setBudget(food.id, 500_000);
    await expect(engine.setBudget(groceries.id, 50_000, { period: "week" })).rejects.toThrow(
      /same period/i,
    );
    await engine.setBudget(groceries.id, 50_000);
    // Moving the parent would leave its child on another period.
    await expect(engine.setBudget(food.id, 500_000, { period: "week" })).rejects.toThrow(
      /same period/i,
    );
    // A Category with no budgeted ancestor or descendant is free to choose.
    await engine.setBudget(fuel.id, 50_000, { period: "week" });
    expect((await engine.listBudgets()).map((b) => [b.categoryId, b.period])).toEqual([
      [food.id, "month"],
      [groceries.id, "month"],
      [fuel.id, "week"],
    ]);
  });

  it("keep changes to one budget's amount from touching its period or carry-over", async () => {
    const { engine, fuel } = await month();
    await engine.setBudget(fuel.id, 100_000, { period: "week", carryOver: true });
    await engine.setBudget(fuel.id, 120_000);
    expect(await engine.listBudgets()).toEqual([
      { categoryId: fuel.id, amount: 120_000, period: "week", carryOver: true },
    ]);
  });
});

describe("the overall budget", () => {
  it("caps all spending, whatever the Category budgets add up to", async () => {
    const { engine, cash, rent, food, groceries, fuel, spend } = await month();
    await engine.setOverallBudget(2_000_000);
    await engine.setBudget(food.id, 500_000);
    await engine.setBudget(groceries.id, 100_000); // inside Food: not counted twice
    await engine.setBudget(fuel.id, 300_000);
    await spend(cash.id, rent.id, -900_000); // no budget of its own
    await spend(cash.id, groceries.id, -100_000);

    const { overall } = await engine.budgetProgress(october);
    expect(overall).toMatchObject({
      amount: 2_000_000,
      spent: 1_000_000,
      remaining: 1_000_000,
      used: 5_000,
      state: "on-track",
      allocated: 800_000,
      unallocated: 1_200_000,
    });
  });

  it("shows a negative unallocated amount when Category budgets exceed it", async () => {
    const { engine, food, fuel } = await month();
    await engine.setOverallBudget(600_000);
    await engine.setBudget(food.id, 500_000);
    await engine.setBudget(fuel.id, 300_000);
    expect((await engine.budgetProgress(october)).overall).toMatchObject({
      allocated: 800_000,
      unallocated: -200_000,
    });
  });

  it("is compared only with Category budgets of its own period", async () => {
    const { engine, food, fuel } = await month();
    await engine.setOverallBudget(2_000_000);
    await engine.setBudget(food.id, 500_000);
    await engine.setBudget(fuel.id, 100_000, { period: "week" });
    expect((await engine.budgetProgress(october)).overall).toMatchObject({
      allocated: 500_000,
      unallocated: 1_500_000,
    });
  });

  it("is over, near or on track like any budget, and never blocks", async () => {
    const { engine, cash, rent, spend } = await month();
    await engine.setOverallBudget(1_000_000);
    await spend(cash.id, rent.id, -850_000);
    expect((await engine.budgetProgress(october)).overall).toMatchObject({ state: "near" });
    await spend(cash.id, rent.id, -300_000);
    expect((await engine.budgetProgress(october)).overall).toMatchObject({
      state: "over",
      remaining: -150_000,
    });
  });

  it("can be changed, removed and set again, and is absent until set", async () => {
    const { engine } = await month();
    expect((await engine.budgetProgress(october)).overall).toBeUndefined();
    expect(await engine.getOverallBudget()).toBeUndefined();
    await engine.setOverallBudget(1_000_000, { period: "year", carryOver: true });
    await engine.setOverallBudget(1_500_000);
    expect(await engine.getOverallBudget()).toEqual({
      amount: 1_500_000,
      period: "year",
      carryOver: true,
    });
    await engine.removeOverallBudget();
    expect(await engine.getOverallBudget()).toBeUndefined();
    await expect(engine.removeOverallBudget()).rejects.toThrow();
    await expect(engine.setOverallBudget(0)).rejects.toThrow();
    await engine.setOverallBudget(700_000);
    expect(await engine.getOverallBudget()).toEqual({
      amount: 700_000,
      period: "month",
      carryOver: false,
    });
  });

  it("is not among the Category budgets", async () => {
    const { engine, fuel } = await month();
    await engine.setOverallBudget(1_000_000);
    expect(await engine.listBudgets()).toEqual([]);
    await engine.setBudget(fuel.id, 1);
    expect((await standing(engine, october)).map((p) => p.categoryId)).toEqual([fuel.id]);
  });
});

describe("changing the amount", () => {
  it("applies from the current period forward and leaves past periods alone", async () => {
    const { engine, fuel } = await month();
    await engine.setBudget(fuel.id, 100_000, { today: "2026-08-10" });
    await engine.setBudget(fuel.id, 200_000, { today: "2026-10-05" });
    await engine.setBudget(fuel.id, 250_000, { today: "2026-10-20" });

    const amountOn = async (on: string) => (await standing(engine, on))[0]!.amount;
    expect(await amountOn("2026-08-15")).toBe(100_000);
    expect(await amountOn("2026-09-15")).toBe(100_000);
    expect(await amountOn("2026-10-15")).toBe(250_000);
    expect(await amountOn("2026-11-15")).toBe(250_000);
    expect(await engine.listBudgets()).toEqual([MONTHLY(fuel.id, 250_000)]);
  });

  it("is the same on another device that gets the changes in any order", async () => {
    const one = await month();
    const two = await device(undefined, "dev-b");
    await one.engine.setBudget(one.fuel.id, 100_000, { today: "2026-08-10" });
    one.clock.advance(10);
    await one.engine.setBudget(one.fuel.id, 200_000, { today: "2026-10-05" });
    const ops = await one.engine.exportOps();
    await two.engine.applyOps([...ops].reverse());
    const amounts = async (engine: Engine) => [
      (await standing(engine, "2026-09-15"))[0]!.amount,
      (await standing(engine, "2026-10-15"))[0]!.amount,
    ];
    expect(await amounts(two.engine)).toEqual([100_000, 200_000]);
  });
});

describe("carry-over", () => {
  async function carrying() {
    const m = await month();
    await m.engine.setBudget(m.fuel.id, 100_000, { carryOver: true, today: "2026-08-05" });
    await m.spend(m.cash.id, m.fuel.id, -999_999, "2026-07-20"); // before the budget existed
    await m.spend(m.cash.id, m.fuel.id, -60_000, "2026-08-10");
    await m.spend(m.cash.id, m.fuel.id, -130_000, "2026-09-10");
    await m.spend(m.cash.id, m.fuel.id, -50_000, "2026-10-10");
    return m;
  }

  it("adds what was unspent to the next period and takes off what was overspent", async () => {
    const { engine } = await carrying();
    const on = async (date: string) => (await standing(engine, date))[0]!;
    expect(await on("2026-08-15")).toMatchObject({ carryIn: 0, limit: 100_000, remaining: 40_000 });
    expect(await on("2026-09-15")).toMatchObject({
      carryIn: 40_000,
      amount: 100_000,
      limit: 140_000,
      spent: 130_000,
      remaining: 10_000,
    });
    expect(await on("2026-10-15")).toMatchObject({
      carryIn: 10_000,
      limit: 110_000,
      remaining: 60_000,
      used: 4_545,
    });
    // Nothing carries from before the budget existed.
    expect(await on("2026-07-15")).toMatchObject({ carryIn: 0 });
  });

  it("subtracts a debt when a period went over, and judges the state against the limit", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000, { carryOver: true, today: "2026-09-01" });
    await spend(cash.id, fuel.id, -150_000, "2026-09-10");
    await spend(cash.id, fuel.id, -40_000, "2026-10-10");
    expect((await standing(engine, "2026-10-15"))[0]).toMatchObject({
      carryIn: -50_000,
      limit: 50_000,
      spent: 40_000,
      state: "near",
    });
    await spend(cash.id, fuel.id, -20_000, "2026-10-11");
    expect((await standing(engine, "2026-10-15"))[0]).toMatchObject({
      state: "over",
      remaining: -10_000,
    });
  });

  it("is over when earlier overspending leaves nothing to spend", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000, { carryOver: true, today: "2026-09-01" });
    await spend(cash.id, fuel.id, -200_000, "2026-09-10");
    expect((await standing(engine, "2026-10-15"))[0]).toMatchObject({
      limit: 0,
      state: "on-track",
      remaining: 0,
    });
    await spend(cash.id, fuel.id, -1, "2026-10-11");
    expect((await standing(engine, "2026-10-15"))[0]).toMatchObject({ state: "over" });
  });

  it("is computed on the fly and never stored", async () => {
    const { engine } = await carrying();
    const before = (await engine.exportOps()).length;
    await standing(engine, "2026-10-15");
    expect((await engine.exportOps()).length).toBe(before);
  });

  it("follows the amount each past period actually had", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000, { carryOver: true, today: "2026-08-05" });
    await engine.setBudget(fuel.id, 300_000, { today: "2026-09-02" });
    await spend(cash.id, fuel.id, -100_000, "2026-08-10");
    await spend(cash.id, fuel.id, -100_000, "2026-09-10");
    expect((await standing(engine, "2026-10-15"))[0]).toMatchObject({
      carryIn: 200_000, // Aug 0 left, Sep 300,000 - 100,000
      limit: 500_000,
    });
  });

  it("works for weeks, and for the overall budget", async () => {
    const { engine, cash, rent, spend } = await month();
    await engine.setOverallBudget(100_000, {
      period: "week",
      carryOver: true,
      today: "2026-10-01",
    });
    await spend(cash.id, rent.id, -30_000, "2026-10-01"); // Thursday of the week of Sep 28
    await spend(cash.id, rent.id, -50_000, "2026-10-06");
    const { overall } = await engine.budgetProgress("2026-10-14");
    // Weeks of Sep 28 (70,000 left), Oct 5 (100,000 + 70,000 - 50,000 left), then Oct 12.
    expect(overall).toMatchObject({ carryIn: 120_000, limit: 220_000, spent: 0 });
  });

  it("is off unless asked for", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000, { today: "2026-08-05" });
    await spend(cash.id, fuel.id, -10_000, "2026-09-10");
    expect((await standing(engine, "2026-10-15"))[0]).toMatchObject({ carryIn: 0, limit: 100_000 });
  });
});

describe("threshold crossings", () => {
  async function crossing(engine: Engine, change: () => Promise<unknown>, on = october) {
    const before = await engine.budgetProgress(on);
    await change();
    return thresholdCrossings(before, await engine.budgetProgress(on));
  }

  it("name each budget a saved Transaction pushed to near or over", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    expect(await crossing(engine, () => spend(cash.id, fuel.id, -50_000))).toEqual([]);
    expect(await crossing(engine, () => spend(cash.id, fuel.id, -35_000))).toEqual([
      {
        categoryId: fuel.id,
        name: "Fuel",
        range: { from: "2026-10-01", to: "2026-10-31" },
        from: "on-track",
        state: "near",
      },
    ]);
    // Already near: more spending that stays near is not a new crossing.
    expect(await crossing(engine, () => spend(cash.id, fuel.id, -5_000))).toEqual([]);
    expect(await crossing(engine, () => spend(cash.id, fuel.id, -20_000))).toMatchObject([
      { categoryId: fuel.id, from: "near", state: "over" },
    ]);
    expect(await crossing(engine, () => spend(cash.id, fuel.id, -20_000))).toEqual([]);
  });

  it("go straight to over, and cover a parent, a child and the overall budget together", async () => {
    const { engine, cash, food, groceries, spend } = await month();
    await engine.setOverallBudget(100_000);
    await engine.setBudget(food.id, 100_000);
    await engine.setBudget(groceries.id, 50_000);
    const events = await crossing(engine, () => spend(cash.id, groceries.id, -120_000));
    expect(events.map((e) => [e.categoryId ?? "overall", e.from, e.state])).toEqual([
      [food.id, "on-track", "over"],
      [groceries.id, "on-track", "over"],
      ["overall", "on-track", "over"],
    ]);
  });

  it("are not produced by spending less, or by a Transaction in another period", async () => {
    const { engine, cash, fuel, spend } = await month();
    await engine.setBudget(fuel.id, 100_000);
    await spend(cash.id, fuel.id, -90_000);
    expect(await crossing(engine, () => spend(cash.id, fuel.id, 80_000))).toEqual([]);
    expect(await crossing(engine, () => spend(cash.id, fuel.id, -500_000, "2026-09-10"))).toEqual(
      [],
    );
  });
});
