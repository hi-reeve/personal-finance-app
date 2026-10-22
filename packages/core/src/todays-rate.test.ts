import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

async function world() {
  const engine = await createEngine({
    deviceId: "dev-a",
    clock: createManualClock(1_700_000_000_000),
    random: createSeededRandom(1),
    store: createMemoryStore(),
  });
  const cash = await engine.completeSetup({
    baseCurrency: "IDR",
    account: { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 },
  });
  const wise = await engine.createAccount({
    name: "Wise",
    kind: "bank",
    currency: "USD",
    openingBalance: 0,
  });
  const euro = await engine.createAccount({
    name: "N26",
    kind: "bank",
    currency: "EUR",
    openingBalance: 0,
  });
  const food = await engine.createCategory({ name: "Food", kind: "expense" });
  const fuel = await engine.createCategory({ name: "Fuel", kind: "expense" });
  const spend = (
    accountId: string,
    date: string,
    categoryId: string,
    amount: number,
    rate?: string,
  ) =>
    engine.recordTransaction({
      accountId,
      date,
      ...(rate ? { rate } : {}),
      lines: [{ categoryId, amount }],
    });
  // Rp 100,000 at home, $10 at 16,000 and €5 at 17,500.
  await spend(cash.id, "2026-10-05", fuel.id, -100_000);
  await spend(wise.id, "2026-10-06", food.id, -1_000, "16000");
  await spend(euro.id, "2026-10-07", food.id, -500, "17500");
  return { engine, food, fuel };
}

const period = { from: "2026-10-01", to: "2026-10-31" };

describe("at today's rate", () => {
  it("reconverts foreign-currency Lines and leaves base-currency ones alone", async () => {
    const { engine } = await world();
    const recorded = await engine.spendingByCategory(period);
    expect(recorded.total).toBe(100_000 + 160_000 + 87_500);

    const today = await engine.spendingByCategory({
      ...period,
      todayRates: { USD: "17000", EUR: "18000" },
    });
    expect(today.categories.map((c) => [c.name, c.total])).toEqual([
      ["Food", 170_000 + 90_000],
      ["Fuel", 100_000],
    ]);
    expect(today.total).toBe(360_000);
    expect(today.noRate).toEqual([]);
  });

  it("never guesses: a currency without a rate is left out and named", async () => {
    const { engine } = await world();
    const today = await engine.spendingByCategory({ ...period, todayRates: { USD: "17000" } });
    expect(today.total).toBe(100_000 + 170_000);
    expect(today.skipped).toEqual({ lines: 1 });
    expect(today.noRate).toEqual(["EUR"]);
  });

  it("treats a rate that is not a rate as no rate", async () => {
    const { engine } = await world();
    const today = await engine.spendingByCategory({
      ...period,
      todayRates: { USD: "soon", EUR: "0" },
    });
    expect(today.total).toBe(100_000);
    expect(today.noRate).toEqual(["EUR", "USD"]);
  });

  it("is the recorded view when no rates are given, with nothing marked missing", async () => {
    const { engine } = await world();
    expect((await engine.spendingByCategory(period)).noRate).toEqual([]);
  });

  it("applies to the daily and monthly totals too", async () => {
    const { engine } = await world();
    const todayRates = { USD: "17000", EUR: "18000" };
    const daily = await engine.dailyTotals({ ...period, todayRates });
    expect(daily.days.find((d) => d.date === "2026-10-06")!.total).toBe(170_000);
    const monthly = await engine.monthlyTotals({ ...period, todayRates });
    expect(monthly.months[0]!.expense).toBe(360_000);
  });
});

describe("the difference today's rate makes", () => {
  it("says how much higher the same spending would be", async () => {
    const { engine } = await world();
    const effect = await engine.rateEffect({
      ...period,
      todayRates: { USD: "17000", EUR: "18000" },
    });
    expect(effect).toMatchObject({
      currency: "IDR",
      asRecorded: 347_500,
      atTodaysRate: 360_000,
      difference: 12_500,
      noRate: [],
      skipped: { lines: 0 },
    });
  });

  it("is negative when the money has got stronger", async () => {
    const { engine } = await world();
    const effect = await engine.rateEffect({
      ...period,
      todayRates: { USD: "15000", EUR: "17500" },
    });
    expect(effect.difference).toBe(-10_000);
  });

  it("compares only what both views can convert, so one missing rate does not skew it", async () => {
    const { engine } = await world();
    const effect = await engine.rateEffect({ ...period, todayRates: { USD: "17000" } });
    expect(effect).toMatchObject({
      asRecorded: 260_000,
      atTodaysRate: 270_000,
      difference: 10_000,
      noRate: ["EUR"],
      skipped: { lines: 1 },
    });
  });

  it("is nothing when everything is in the base currency", async () => {
    const { engine } = await world();
    const effect = await engine.rateEffect({
      from: "2026-10-05",
      to: "2026-10-05",
      todayRates: {},
    });
    expect(effect).toMatchObject({ asRecorded: 100_000, atTodaysRate: 100_000, difference: 0 });
  });

  it("can total income as well", async () => {
    const { engine } = await world();
    const effect = await engine.rateEffect({
      ...period,
      kind: "income",
      todayRates: { USD: "17000" },
    });
    expect(effect).toMatchObject({ kind: "income", asRecorded: 0, difference: 0 });
  });
});
