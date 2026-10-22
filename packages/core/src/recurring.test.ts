import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

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

async function world() {
  const { engine, clock, store } = await device();
  const cash = await engine.completeSetup({
    baseCurrency: "IDR",
    account: { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 },
  });
  const bank = await engine.createAccount({
    name: "BCA",
    kind: "bank",
    currency: "IDR",
    openingBalance: 0,
  });
  const wise = await engine.createAccount({
    name: "Wise",
    kind: "bank",
    currency: "USD",
    openingBalance: 0,
  });
  const rent = await engine.createCategory({ name: "Rent", kind: "expense" });
  const salary = await engine.createCategory({ name: "Salary", kind: "income" });
  const bill = (extra = {}) =>
    engine.createRecurring({
      name: "Internet",
      kind: "expense",
      accountId: cash.id,
      categoryId: rent.id,
      amount: 850_000,
      every: 1,
      unit: "month",
      start: "2026-10-05",
      ...extra,
    });
  return { engine, clock, store, cash, bank, wise, rent, salary, bill };
}

type Engine = Awaited<ReturnType<typeof world>>["engine"];
const dues = async (engine: Engine, to: string, today = "2026-10-01", from?: string) =>
  (await engine.listOccurrences({ to, today, ...(from ? { from } : {}) })).map((o) => o.due);

describe("schedules", () => {
  it("repeat every N days, weeks, months or years from the start", async () => {
    const { engine, bill } = await world();
    const check = async (extra: object, to: string) => {
      const item = await bill(extra);
      const found = await dues(engine, to, "2026-01-01", "2026-01-01");
      await engine.deleteRecurring(item.id);
      return found;
    };
    expect(await check({ every: 10, unit: "day", start: "2026-10-01" }, "2026-10-31")).toEqual([
      "2026-10-01",
      "2026-10-11",
      "2026-10-21",
      "2026-10-31",
    ]);
    expect(await check({ every: 2, unit: "week", start: "2026-10-05" }, "2026-11-20")).toEqual([
      "2026-10-05",
      "2026-10-19",
      "2026-11-02",
      "2026-11-16",
    ]);
    expect(await check({ every: 3, unit: "month", start: "2026-10-05" }, "2027-10-05")).toEqual([
      "2026-10-05",
      "2027-01-05",
      "2027-04-05",
      "2027-07-05",
      "2027-10-05",
    ]);
    expect(await check({ every: 1, unit: "year", start: "2026-03-01" }, "2028-12-31")).toEqual([
      "2026-03-01",
      "2027-03-01",
      "2028-03-01",
    ]);
  });

  it("clamp a monthly day the month lacks, and keep the start's day afterwards", async () => {
    const { engine, bill } = await world();
    await bill({ start: "2027-01-31" });
    expect(await dues(engine, "2027-05-31", "2027-01-01", "2027-01-01")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
  });

  it("clamp to the 29th in a leap year and to the 28th otherwise, also for yearly items", async () => {
    const { engine, bill } = await world();
    await bill({ start: "2028-02-29", unit: "year" });
    expect(await dues(engine, "2031-03-01", "2028-01-01", "2028-01-01")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
    ]);
  });

  it("can fall on the last day of every month", async () => {
    const { engine, bill } = await world();
    await bill({ start: "2026-10-15", lastDay: true });
    expect(await dues(engine, "2027-02-28", "2026-10-01", "2026-10-01")).toEqual([
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
    ]);
  });

  it("stop at the end date or after a number of occurrences", async () => {
    const { engine, bill } = await world();
    const byDate = await bill({ endDate: "2026-12-05" });
    expect(await dues(engine, "2027-12-31", "2026-01-01", "2026-01-01")).toEqual([
      "2026-10-05",
      "2026-11-05",
      "2026-12-05",
    ]);
    await engine.deleteRecurring(byDate.id);
    await bill({ endCount: 2 });
    expect(await dues(engine, "2027-12-31", "2026-01-01", "2026-01-01")).toEqual([
      "2026-10-05",
      "2026-11-05",
    ]);
  });
});

describe("occurrence states", () => {
  it("are upcoming, due soon within three days, and overdue until someone acts", async () => {
    const { engine, bill } = await world();
    await bill({ start: "2026-09-05" });
    const states = async (today: string) =>
      (await engine.listOccurrences({ to: "2026-11-30", today })).map((o) => [o.due, o.status]);
    expect(await states("2026-10-01")).toEqual([
      ["2026-09-05", "overdue"],
      ["2026-10-05", "upcoming"],
      ["2026-11-05", "upcoming"],
    ]);
    expect(await states("2026-10-02")).toContainEqual(["2026-10-05", "due-soon"]);
    expect(await states("2026-09-30")).toContainEqual(["2026-10-05", "upcoming"]);
    // Due today is due soon; the day after, overdue. Nothing disappears with time.
    expect(await states("2026-10-05")).toContainEqual(["2026-10-05", "due-soon"]);
    expect(await states("2026-10-06")).toContainEqual(["2026-10-05", "overdue"]);
    expect(await states("2027-06-01")).toContainEqual(["2026-09-05", "overdue"]);
  });

  it("carry the item, the id, the expected amount and the kind", async () => {
    const { engine, bill } = await world();
    const item = await bill();
    const [first] = await engine.listOccurrences({ to: "2026-10-31", today: "2026-10-01" });
    expect(first).toMatchObject({
      id: `occ-${item.id}-2026-10-05`,
      itemId: item.id,
      kind: "expense",
      expected: 850_000,
    });
  });

  it("are only the ones nobody acted on unless a start is given", async () => {
    const { engine, bill } = await world();
    const item = await bill({ start: "2026-08-05" });
    await engine.markPaid(item.id, "2026-08-05");
    expect(await dues(engine, "2026-10-31", "2026-10-01")).toEqual(["2026-09-05", "2026-10-05"]);
    expect(await dues(engine, "2026-10-31", "2026-10-01", "2026-08-01")).toEqual([
      "2026-08-05",
      "2026-09-05",
      "2026-10-05",
    ]);
  });
});

describe("marking paid", () => {
  it("creates the Transaction on the due date, counts only then, and shows expected against paid", async () => {
    const { engine, cash, rent, bill } = await world();
    const item = await bill();
    const month = { from: "2026-10-01", to: "2026-10-31" };
    expect((await engine.spendingByCategory(month)).total).toBe(0);

    const paid = await engine.markPaid(item.id, "2026-10-05", { amount: 840_000 });
    expect(paid.transaction).toMatchObject({
      accountId: cash.id,
      date: "2026-10-05",
      payee: "Internet",
      total: -840_000,
      lines: [{ categoryId: rent.id, amount: -840_000 }],
    });
    expect((await engine.spendingByCategory(month)).total).toBe(840_000);

    const [occurrence] = await engine.listOccurrences({
      from: "2026-10-01",
      to: "2026-10-31",
      today: "2026-10-20",
    });
    expect(occurrence).toMatchObject({
      status: "paid",
      expected: 850_000,
      paid: 840_000,
      difference: 10_000,
      transactionId: paid.transaction!.id,
    });
    expect(await dues(engine, "2026-10-31", "2026-10-20")).toEqual([]);
  });

  it("can be paid on another date, and income comes in", async () => {
    const { engine, bank, salary, bill } = await world();
    const item = await bill({
      name: "Salary",
      kind: "income",
      accountId: bank.id,
      categoryId: salary.id,
      amount: 10_000_000,
    });
    const { transaction } = await engine.markPaid(item.id, "2026-10-05", { date: "2026-10-07" });
    expect(transaction).toMatchObject({ date: "2026-10-07", total: 10_000_000 });
  });

  it("creates a Transfer for a transfer item", async () => {
    const { engine, cash, bank, bill } = await world();
    const item = await bill({
      name: "Savings",
      kind: "transfer",
      accountId: cash.id,
      toAccountId: bank.id,
      categoryId: undefined,
      amount: 500_000,
    });
    const { transfer } = await engine.markPaid(item.id, "2026-10-05");
    expect(transfer).toMatchObject({
      fromAccountId: cash.id,
      toAccountId: bank.id,
      fromAmount: 500_000,
      toAmount: 500_000,
      date: "2026-10-05",
    });
    expect(await engine.getBalance(bank.id)).toBe(500_000);
    const [occurrence] = await engine.listOccurrences({
      from: "2026-10-01",
      to: "2026-10-31",
      today: "2026-10-20",
    });
    expect(occurrence).toMatchObject({ status: "paid", transferId: transfer!.id, paid: 500_000 });
  });

  it("needs a rate for an Account in another currency, and only once", async () => {
    const { engine, wise, rent, bill } = await world();
    const item = await bill({ accountId: wise.id, categoryId: rent.id, amount: 1_000 });
    await expect(engine.markPaid(item.id, "2026-10-05")).rejects.toThrow(/rate/i);
    const { transaction } = await engine.markPaid(item.id, "2026-10-05", { rate: "16000" });
    expect(transaction).toMatchObject({ total: -1_000, rate: "16000" });
    await expect(engine.markPaid(item.id, "2026-10-05", { rate: "16000" })).rejects.toThrow(
      /already/i,
    );
  });

  it("only works on a day the schedule has", async () => {
    const { engine, bill } = await world();
    const item = await bill();
    await expect(engine.markPaid(item.id, "2026-10-06")).rejects.toThrow(/not due/i);
    await expect(engine.markPaid("ghost", "2026-10-05")).rejects.toThrow();
  });
});

describe("linking an existing Transaction", () => {
  it("offers Transactions near the due date on the same Account and kind", async () => {
    const { engine, cash, bank, rent, salary, bill } = await world();
    const item = await bill();
    const pay = (accountId: string, categoryId: string, amount: number, date: string) =>
      engine.recordTransaction({ accountId, date, lines: [{ categoryId, amount }] });
    const near = await pay(cash.id, rent.id, -849_000, "2026-10-19"); // 14 days after
    await pay(cash.id, rent.id, -1, "2026-10-21"); // 16 days after: too far
    await pay(bank.id, rent.id, -850_000, "2026-10-05"); // another Account
    await pay(cash.id, salary.id, 850_000, "2026-10-05"); // income, not an expense

    const found = await engine.linkCandidates(item.id, "2026-10-05");
    expect(found.transactions.map((t) => t.id)).toEqual([near.id]);
    expect(found.transfers).toEqual([]);
    expect((await engine.linkCandidates(item.id, "2026-10-05", 20)).transactions).toHaveLength(2);
  });

  it("marks the occurrence paid without a second Transaction, and reopens it if that one is deleted", async () => {
    const { engine, cash, rent, bill } = await world();
    const item = await bill();
    const tx = await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-10-06",
      lines: [{ categoryId: rent.id, amount: -840_000 }],
    });
    await engine.linkOccurrence(item.id, "2026-10-05", { transactionId: tx.id });
    expect(await engine.listTransactions()).toHaveLength(1);
    const range = { from: "2026-10-01", to: "2026-10-31", today: "2026-10-20" };
    expect((await engine.listOccurrences(range))[0]).toMatchObject({
      status: "paid",
      paid: 840_000,
      difference: 10_000,
    });
    // A Transaction that is gone no longer pays the bill.
    await engine.deleteTransaction(tx.id);
    expect((await engine.listOccurrences(range))[0]).toMatchObject({ status: "overdue" });
  });

  it("refuses a Transaction of the wrong kind, or one that already pays another occurrence", async () => {
    const { engine, cash, rent, salary, bill } = await world();
    const item = await bill({ start: "2026-09-05" });
    const income = await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-09-05",
      lines: [{ categoryId: salary.id, amount: 850_000 }],
    });
    await expect(
      engine.linkOccurrence(item.id, "2026-09-05", { transactionId: income.id }),
    ).rejects.toThrow(/does not fit/);
    const pay = await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-09-05",
      lines: [{ categoryId: rent.id, amount: -850_000 }],
    });
    await engine.linkOccurrence(item.id, "2026-09-05", { transactionId: pay.id });
    await expect(
      engine.linkOccurrence(item.id, "2026-10-05", { transactionId: pay.id }),
    ).rejects.toThrow(/does not fit/);
  });

  it("links a Transfer to a transfer item, and refuses one that does not fit", async () => {
    const { engine, cash, bank, rent, bill } = await world();
    const item = await bill({
      kind: "transfer",
      toAccountId: bank.id,
      categoryId: undefined,
      amount: 500_000,
    });
    const move = await engine.recordTransfer({
      date: "2026-10-05",
      fromAccountId: cash.id,
      toAccountId: bank.id,
      fromAmount: 500_000,
      toAmount: 500_000,
    });
    expect((await engine.linkCandidates(item.id, "2026-10-05")).transfers.map((t) => t.id)).toEqual(
      [move.id],
    );
    await engine.linkOccurrence(item.id, "2026-10-05", { transferId: move.id });
    const tx = await engine.recordTransaction({
      accountId: cash.id,
      date: "2026-10-05",
      lines: [{ categoryId: rent.id, amount: -1 }],
    });
    await expect(
      engine.linkOccurrence(item.id, "2026-11-05", { transactionId: tx.id }),
    ).rejects.toThrow();
  });
});

describe("skipping", () => {
  it("keeps a skipped occurrence in the history and out of the open list", async () => {
    const { engine, bill } = await world();
    const item = await bill({ start: "2026-09-05" });
    await engine.skipOccurrence(item.id, "2026-09-05");
    const range = { from: "2026-09-01", to: "2026-10-31", today: "2026-10-01" };
    expect((await engine.listOccurrences(range)).map((o) => [o.due, o.status])).toEqual([
      ["2026-09-05", "skipped"],
      ["2026-10-05", "upcoming"],
    ]);
    expect(await dues(engine, "2026-10-31")).toEqual(["2026-10-05"]);
    await engine.reopenOccurrence(item.id, "2026-09-05");
    expect(await dues(engine, "2026-10-31")).toEqual(["2026-09-05", "2026-10-05"]);
  });

  it("skips all older occurrences in one go, but not paid ones or newer ones", async () => {
    const { engine, bill } = await world();
    const item = await bill({ start: "2026-06-05" });
    await engine.markPaid(item.id, "2026-07-05");
    const count = await engine.skipOlder(item.id, "2026-10-05");
    expect(count).toBe(3); // June, August and September
    const all = await engine.listOccurrences({
      from: "2026-06-01",
      to: "2026-11-30",
      today: "2026-10-20",
    });
    expect(all.map((o) => [o.due, o.status])).toEqual([
      ["2026-06-05", "skipped"],
      ["2026-07-05", "paid"],
      ["2026-08-05", "skipped"],
      ["2026-09-05", "skipped"],
      ["2026-10-05", "overdue"],
      ["2026-11-05", "upcoming"],
    ]);
  });

  it("refuses to skip what is already paid", async () => {
    const { engine, bill } = await world();
    const item = await bill();
    await engine.markPaid(item.id, "2026-10-05");
    await expect(engine.skipOccurrence(item.id, "2026-10-05")).rejects.toThrow(/paid/i);
  });
});

describe("recurring items", () => {
  it("change future occurrences only: paid ones keep the amount they expected", async () => {
    const { engine, bill } = await world();
    const item = await bill({ start: "2026-09-05" });
    await engine.markPaid(item.id, "2026-09-05");
    await engine.updateRecurring(item.id, { amount: 900_000 });
    const all = await engine.listOccurrences({
      from: "2026-09-01",
      to: "2026-10-31",
      today: "2026-10-01",
    });
    expect(all.map((o) => [o.due, o.expected])).toEqual([
      ["2026-09-05", 850_000],
      ["2026-10-05", 900_000],
    ]);
  });

  it("keep a paid occurrence listed after the schedule moves", async () => {
    const { engine, bill } = await world();
    const item = await bill({ start: "2026-09-05" });
    await engine.markPaid(item.id, "2026-09-05");
    await engine.updateRecurring(item.id, { start: "2026-09-10" });
    const all = await engine.listOccurrences({
      from: "2026-09-01",
      to: "2026-09-30",
      today: "2026-10-01",
    });
    expect(all.map((o) => [o.due, o.status])).toEqual([
      ["2026-09-05", "paid"],
      ["2026-09-10", "overdue"],
    ]);
  });

  it("can be ended, and deleted while the Transactions stay", async () => {
    const { engine, cash, bill } = await world();
    const item = await bill({ start: "2026-09-05" });
    await engine.markPaid(item.id, "2026-09-05");
    await engine.updateRecurring(item.id, { endDate: "2026-10-05" });
    expect(await dues(engine, "2027-01-01", "2026-10-01")).toEqual(["2026-10-05"]);
    await engine.updateRecurring(item.id, { endDate: null });
    expect(await dues(engine, "2026-12-31", "2026-10-01")).toContain("2026-12-05");
    await engine.deleteRecurring(item.id);
    expect(await engine.listRecurring()).toEqual([]);
    expect(await dues(engine, "2027-01-01", "2026-10-01", "2026-01-01")).toEqual([]);
    expect(await engine.listTransactions()).toHaveLength(1);
    expect(await engine.getBalance(cash.id)).toBe(-850_000);
  });

  it("are checked: name, kind, accounts, category, amount and schedule", async () => {
    const { engine, cash, rent, salary, bill } = await world();
    const bad: object[] = [
      { name: "  " },
      { kind: "gift" },
      { accountId: "ghost" },
      { categoryId: undefined },
      { categoryId: salary.id }, // an income Category on an expense item
      { amount: 0 },
      { amount: 1.5 },
      { every: 0 },
      { every: 1.5 },
      { unit: "decade" },
      { start: "2026-02-30" },
      { endDate: "2026-01-01" },
      { endCount: 0 },
      { kind: "transfer", categoryId: undefined }, // no destination
      { kind: "transfer", categoryId: undefined, toAccountId: cash.id }, // same Account
      { toAccountId: cash.id }, // a destination on an expense
    ];
    for (const extra of bad) {
      await expect(bill(extra), JSON.stringify(extra)).rejects.toThrow();
    }
    expect(await engine.listRecurring()).toEqual([]);
    await expect(
      engine.createRecurring({
        name: "x",
        kind: "expense",
        accountId: cash.id,
        categoryId: rent.id,
        amount: 1,
        every: 1,
        unit: "month",
        start: "2026-10-05",
        lastDay: true,
        endCount: 1,
      }),
    ).resolves.toMatchObject({ lastDay: true, endCount: 1 });
  });

  it("list in the order they were made", async () => {
    const { engine, bill } = await world();
    await bill({ name: "B" });
    await bill({ name: "A" });
    expect((await engine.listRecurring()).map((i) => i.name)).toEqual(["B", "A"]);
  });
});

describe("two devices", () => {
  it("agree on one winner when both mark the same occurrence paid, and delete nothing", async () => {
    const one = await world();
    const two = await device(undefined, "dev-b");
    const item = await one.bill();
    await two.engine.applyOps(await one.engine.exportOps());

    await one.engine.markPaid(item.id, "2026-10-05");
    two.clock.advance(1_000);
    await two.engine.markPaid(item.id, "2026-10-05");
    await one.engine.applyOps(await two.engine.exportOps());
    await two.engine.applyOps(await one.engine.exportOps());

    const range = { from: "2026-10-01", to: "2026-10-31", today: "2026-10-20" };
    const [a] = await one.engine.listOccurrences(range);
    const [b] = await two.engine.listOccurrences(range);
    expect(a).toMatchObject({ id: `occ-${item.id}-2026-10-05`, status: "paid" });
    expect(a).toEqual(b);
    // The loser's Transaction is still there as an ordinary Transaction.
    expect(await one.engine.listTransactions()).toHaveLength(2);
  });

  it("survive a restart", async () => {
    const one = await world();
    const item = await one.bill();
    await one.engine.markPaid(item.id, "2026-10-05");
    const restarted = await device(one.store);
    expect((await restarted.engine.listRecurring()).map((i) => i.id)).toEqual([item.id]);
    expect(
      (
        await restarted.engine.listOccurrences({
          from: "2026-10-01",
          to: "2026-10-31",
          today: "2026-10-20",
        })
      )[0],
    ).toMatchObject({ status: "paid" });
  });
});
