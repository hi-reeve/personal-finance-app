import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { monthlyEquivalent } from "./recurring";
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
  const media = await engine.createCategory({ name: "Media", kind: "expense" });
  const salary = await engine.createCategory({ name: "Salary", kind: "income" });
  const sub = (extra = {}) =>
    engine.createRecurring({
      name: "Netflix",
      kind: "expense",
      accountId: cash.id,
      categoryId: media.id,
      amount: 150_000,
      every: 1,
      unit: "month",
      start: "2026-08-10",
      subscription: true,
      ...extra,
    });
  return { engine, cash, wise, media, salary, sub };
}

const open = async (
  engine: Awaited<ReturnType<typeof world>>["engine"],
  to: string,
  today: string,
) => (await engine.listOccurrences({ to, today })).map((o) => [o.due, o.expected]);

describe("monthly equivalent", () => {
  it("turns any cycle into a month, rounded to a minor unit", () => {
    expect(monthlyEquivalent(1_200_000, 1, "year")).toBe(100_000);
    expect(monthlyEquivalent(900_000, 3, "month")).toBe(300_000);
    expect(monthlyEquivalent(70_000, 1, "week")).toBe(304_167);
    expect(monthlyEquivalent(10_000, 1, "day")).toBe(304_167);
    expect(monthlyEquivalent(150_000, 1, "month")).toBe(150_000);
  });
});

describe("price changes", () => {
  it("leave past occurrences at the price they had, paid or not", async () => {
    const { engine, sub } = await world();
    const item = await sub();
    await engine.markPaid(item.id, "2026-08-10");
    await engine.changeRecurringPrice(item.id, 186_000, "2026-10-10");

    const everything = await engine.listOccurrences({
      from: "2026-08-01",
      to: "2026-11-30",
      today: "2026-10-20",
    });
    expect(everything.map((o) => [o.due, o.status, o.expected])).toEqual([
      ["2026-08-10", "paid", 150_000],
      ["2026-09-10", "overdue", 150_000],
      ["2026-10-10", "overdue", 186_000],
      ["2026-11-10", "upcoming", 186_000],
    ]);
  });

  it("pay the price in force on the due date, and show the difference when less is paid", async () => {
    const { engine, sub } = await world();
    const item = await sub();
    await engine.changeRecurringPrice(item.id, 186_000, "2026-10-10");
    await engine.markPaid(item.id, "2026-09-10");
    await engine.markPaid(item.id, "2026-10-10", { amount: 170_000 });
    const [sept, oct] = await engine.listOccurrences({
      from: "2026-09-01",
      to: "2026-10-31",
      today: "2026-10-20",
    });
    expect([sept!.paid, sept!.difference]).toEqual([150_000, 0]);
    expect([oct!.expected, oct!.paid, oct!.difference]).toEqual([186_000, 170_000, 16_000]);
  });

  it("show the price in force, in order of date, however they were entered", async () => {
    const { engine, sub } = await world();
    const item = await sub();
    await engine.changeRecurringPrice(item.id, 200_000, "2027-01-10");
    await engine.changeRecurringPrice(item.id, 170_000, "2026-10-10");
    const [read] = await engine.listRecurring();
    expect(read!.changes).toEqual([
      { effective: "2026-10-10", amount: 170_000 },
      { effective: "2027-01-10", amount: 200_000 },
    ]);
    expect(read!.amount).toBe(150_000);
    expect(await open(engine, "2027-01-31", "2026-12-01")).toEqual([
      ["2026-08-10", 150_000],
      ["2026-09-10", 150_000],
      ["2026-10-10", 170_000],
      ["2026-11-10", 170_000],
      ["2026-12-10", 170_000],
      ["2027-01-10", 200_000],
    ]);
  });

  it("need a price above zero, a date, and an item that is not a transfer", async () => {
    const { engine, sub, cash, wise } = await world();
    const item = await sub();
    await expect(engine.changeRecurringPrice(item.id, 0, "2026-10-10")).rejects.toThrow();
    await expect(engine.changeRecurringPrice(item.id, 1, "soon")).rejects.toThrow();
    await expect(engine.changeRecurringPrice("nope", 1, "2026-10-10")).rejects.toThrow();
    const transfer = await engine.createRecurring({
      name: "Top up",
      kind: "transfer",
      accountId: cash.id,
      toAccountId: wise.id,
      amount: 1_000_000,
      toAmount: 60,
      every: 1,
      unit: "month",
      start: "2026-10-01",
    });
    await expect(engine.changeRecurringPrice(transfer.id, 2_000_000, "2026-11-01")).rejects.toThrow(
      "transfer",
    );
  });
});

describe("subscriptions", () => {
  it("only an expense can be a subscription", async () => {
    const { engine, cash, salary } = await world();
    await expect(
      engine.createRecurring({
        name: "Pay",
        kind: "income",
        accountId: cash.id,
        categoryId: salary.id,
        amount: 1,
        every: 1,
        unit: "month",
        start: "2026-10-01",
        subscription: true,
      }),
    ).rejects.toThrow("expense");
  });

  it("add up to a monthly total per currency, at today's price", async () => {
    const { engine, sub, wise, media } = await world();
    await sub();
    const yearly = await sub({ name: "iCloud", amount: 1_200_000, every: 1, unit: "year" });
    await engine.createRecurring({
      name: "Spotify",
      kind: "expense",
      accountId: wise.id,
      categoryId: media.id,
      amount: 1_099,
      every: 1,
      unit: "month",
      start: "2026-08-01",
      subscription: true,
    });
    await engine.createRecurring({
      name: "Rent",
      kind: "expense",
      accountId: wise.id,
      categoryId: media.id,
      amount: 90_000,
      every: 1,
      unit: "month",
      start: "2026-08-01",
    });
    await engine.changeRecurringPrice(yearly.id, 1_800_000, "2026-09-01");

    const found = await engine.listSubscriptions("2026-10-15");
    expect(found.subscriptions.map((s) => [s.name, s.price, s.monthly, s.status])).toEqual([
      ["Netflix", 150_000, 150_000, "active"],
      ["iCloud", 1_800_000, 150_000, "active"],
      ["Spotify", 1_099, 1_099, "active"],
    ]);
    expect(found.monthly).toEqual([
      { currency: "IDR", amount: 300_000 },
      { currency: "USD", amount: 1_099 },
    ]);
  });

  it("leave a paused or ended one out of the total, and say so", async () => {
    const { engine, sub } = await world();
    const paused = await sub({ name: "Gym", amount: 400_000 });
    const ended = await sub({ name: "Old", amount: 50_000, endDate: "2026-09-10" });
    await sub();
    await engine.pauseRecurring(paused.id, "2026-10-01");

    const found = await engine.listSubscriptions("2026-10-15");
    expect(found.subscriptions.map((s) => [s.name, s.status])).toEqual([
      ["Gym", "paused"],
      ["Old", "ended"],
      ["Netflix", "active"],
    ]);
    expect(found.monthly).toEqual([{ currency: "IDR", amount: 150_000 }]);
    expect(ended.endDate).toBe("2026-09-10");
  });

  it("can be flagged or unflagged on an existing item", async () => {
    const { engine, sub } = await world();
    const item = await sub({ subscription: false });
    expect((await engine.listSubscriptions("2026-10-15")).subscriptions).toEqual([]);
    await engine.updateRecurring(item.id, { subscription: true });
    expect((await engine.listSubscriptions("2026-10-15")).subscriptions).toHaveLength(1);
  });
});

describe("pause and resume", () => {
  it("nothing falls due while paused, and paying starts again from the resume date", async () => {
    const { engine, sub } = await world();
    const item = await sub({ start: "2026-08-10" });
    await engine.pauseRecurring(item.id, "2026-09-01");
    expect((await open(engine, "2026-12-31", "2026-10-20")).map(([due]) => due)).toEqual([
      "2026-08-10",
    ]);
    await engine.resumeRecurring(item.id, "2026-11-01");
    expect((await open(engine, "2026-12-31", "2026-10-20")).map(([due]) => due)).toEqual([
      "2026-08-10",
      "2026-11-10",
      "2026-12-10",
    ]);
  });

  it("pausing again skips what the earlier pause left behind rather than bringing it back", async () => {
    const { engine, sub } = await world();
    const item = await sub({ start: "2026-08-10" });
    await engine.pauseRecurring(item.id, "2026-09-01");
    await engine.resumeRecurring(item.id, "2026-11-01");
    await engine.pauseRecurring(item.id, "2027-01-01");
    const all = await engine.listOccurrences({
      from: "2026-08-01",
      to: "2027-03-31",
      today: "2026-12-20",
    });
    expect(all.map((o) => [o.due, o.status])).toEqual([
      ["2026-08-10", "overdue"],
      ["2026-09-10", "skipped"],
      ["2026-10-10", "skipped"],
      ["2026-11-10", "overdue"],
      ["2026-12-10", "overdue"],
    ]);
  });

  it("is refused when it makes no sense", async () => {
    const { engine, sub } = await world();
    const item = await sub();
    await expect(engine.resumeRecurring(item.id, "2026-11-01")).rejects.toThrow("not paused");
    await engine.pauseRecurring(item.id, "2026-09-01");
    await expect(engine.resumeRecurring(item.id, "2026-08-01")).rejects.toThrow("before");
    await expect(engine.pauseRecurring("nope", "2026-09-01")).rejects.toThrow();
  });
});

describe("expected bills on budgets", () => {
  it("count what is still to pay in the budget's period, apart from what was spent", async () => {
    const { engine, sub, media, wise } = await world();
    await engine.setBudget(media.id, 400_000, { today: "2026-10-01" });
    await engine.setOverallBudget(1_000_000, { today: "2026-10-01" });
    const netflix = await sub({ start: "2026-10-10" });
    await sub({ name: "Cloud", amount: 100_000, start: "2026-10-28" });
    await sub({ name: "Next month", amount: 77_000, start: "2026-11-02" });
    await engine.createRecurring({
      name: "Spotify",
      kind: "expense",
      accountId: wise.id,
      categoryId: media.id,
      amount: 1_099,
      every: 1,
      unit: "month",
      start: "2026-10-12",
      subscription: true,
    });

    let standing = await engine.budgetProgress("2026-10-15");
    expect(standing.categories[0]).toMatchObject({
      spent: 0,
      expected: 250_000,
      expectedSkipped: 1,
    });
    expect(standing.overall).toMatchObject({ spent: 0, expected: 250_000 });

    await engine.markPaid(netflix.id, "2026-10-10", { amount: 140_000 });
    standing = await engine.budgetProgress("2026-10-15");
    expect(standing.categories[0]).toMatchObject({ spent: 140_000, expected: 100_000 });
    standing = await engine.budgetProgress("2026-11-15");
    expect(standing.categories[0]).toMatchObject({ expected: 327_000 });
  });

  it("use the price in force when the bill is due, and leave out skipped bills and transfers", async () => {
    const { engine, sub, media, cash, wise } = await world();
    await engine.setBudget(media.id, 400_000, { today: "2026-10-01" });
    const item = await sub({ start: "2026-10-03" });
    await engine.changeRecurringPrice(item.id, 190_000, "2026-11-01");
    await engine.createRecurring({
      name: "Top up",
      kind: "transfer",
      accountId: cash.id,
      toAccountId: wise.id,
      amount: 500_000,
      toAmount: 30,
      every: 1,
      unit: "month",
      start: "2026-10-04",
    });
    expect((await engine.budgetProgress("2026-10-15")).categories[0]!.expected).toBe(150_000);
    expect((await engine.budgetProgress("2026-11-15")).categories[0]!.expected).toBe(190_000);
    await engine.skipOccurrence(item.id, "2026-10-03");
    expect((await engine.budgetProgress("2026-10-15")).categories[0]!.expected).toBe(0);
  });

  it("count a bill under a sub-Category against its parent's budget", async () => {
    const { engine, sub, media } = await world();
    const music = await engine.createCategory({
      name: "Music",
      kind: "expense",
      parentId: media.id,
    });
    await engine.setBudget(media.id, 400_000, { today: "2026-10-01" });
    await sub({ categoryId: music.id, start: "2026-10-10" });
    expect((await engine.budgetProgress("2026-10-15")).categories[0]!.expected).toBe(150_000);
  });
});
