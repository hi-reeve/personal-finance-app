import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function setup() {
  const engine = await createEngine({
    deviceId: "dev-a",
    clock: createManualClock(NOW),
    random: createSeededRandom(1),
    store: createMemoryStore(),
  });
  const rupiah = await engine.createAccount({
    name: "BCA",
    kind: "bank",
    currency: "IDR",
    openingBalance: 5_000_000,
  });
  const wallet = await engine.createAccount({
    name: "Dompet",
    kind: "cash",
    currency: "IDR",
    openingBalance: 100_000,
  });
  const dollars = await engine.createAccount({
    name: "Wise",
    kind: "bank",
    currency: "USD",
    openingBalance: 10_000,
  });
  const fees = await engine.createCategory({ name: "Bank fees", kind: "expense" });
  const salary = await engine.createCategory({ name: "Salary", kind: "income" });
  return { engine, rupiah, wallet, dollars, fees, salary };
}

const base = { date: "2026-10-19" };

describe("recording a Transfer", () => {
  it("moves money between two Accounts and changes both balances", async () => {
    const { engine, rupiah, wallet } = await setup();
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 500_000,
      toAmount: 500_000,
    });
    expect(transfer).toMatchObject({ fromAmount: 500_000, toAmount: 500_000, date: "2026-10-19" });
    expect(await engine.getBalance(rupiah.id)).toBe(4_500_000);
    expect(await engine.getBalance(wallet.id)).toBe(600_000);
  });

  it("takes a different amount on each leg across currencies", async () => {
    const { engine, rupiah, dollars } = await setup();
    await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: dollars.id,
      fromAmount: 1_600_000,
      toAmount: 9_800, // $98.00
    });
    expect(await engine.getBalance(rupiah.id)).toBe(3_400_000);
    expect(await engine.getBalance(dollars.id)).toBe(19_800);
  });

  it("records the fee as spending in a Category, taken from the sending Account", async () => {
    const { engine, rupiah, wallet, fees } = await setup();
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 500_000,
      toAmount: 500_000,
      fee: { amount: 6_500, categoryId: fees.id },
    });
    expect(await engine.getBalance(rupiah.id)).toBe(5_000_000 - 500_000 - 6_500);
    expect(await engine.getBalance(wallet.id)).toBe(600_000);

    const spending = await engine.listTransactions();
    expect(spending).toHaveLength(1);
    expect(spending[0]).toMatchObject({
      accountId: rupiah.id,
      date: "2026-10-19",
      total: -6_500,
      transferId: transfer.id,
      lines: [{ categoryId: fees.id, amount: -6_500 }],
    });
    expect(transfer.fee).toEqual({ amount: 6_500, categoryId: fees.id });
  });

  it("is not income or expense: only the fee shows among Transactions", async () => {
    const { engine, rupiah, wallet } = await setup();
    await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 500_000,
      toAmount: 500_000,
    });
    expect(await engine.listTransactions()).toEqual([]);
    expect(await engine.listTransfers()).toHaveLength(1);
  });

  it("refuses what cannot be a Transfer", async () => {
    const { engine, rupiah, wallet, dollars, fees, salary } = await setup();
    const ok = { ...base, fromAccountId: rupiah.id, toAccountId: wallet.id };
    await expect(
      engine.recordTransfer({ ...ok, toAccountId: rupiah.id, fromAmount: 1, toAmount: 1 }),
    ).rejects.toThrow(/same account/i);
    await expect(engine.recordTransfer({ ...ok, fromAmount: 0, toAmount: 0 })).rejects.toThrow();
    await expect(engine.recordTransfer({ ...ok, fromAmount: 1.5, toAmount: 2 })).rejects.toThrow();
    // Same currency: the amounts must match, or money would appear from nowhere.
    await expect(engine.recordTransfer({ ...ok, fromAmount: 100, toAmount: 90 })).rejects.toThrow(
      /same currency/i,
    );
    await expect(
      engine.recordTransfer({ ...ok, toAccountId: "nope", fromAmount: 1, toAmount: 1 }),
    ).rejects.toThrow();
    await expect(
      engine.recordTransfer({
        ...ok,
        fromAmount: 1,
        toAmount: 1,
        fee: { amount: 10, categoryId: salary.id },
      }),
    ).rejects.toThrow(/expense/i);
    await expect(
      engine.recordTransfer({
        ...ok,
        fromAmount: 1,
        toAmount: 1,
        fee: { amount: 0, categoryId: fees.id },
      }),
    ).rejects.toThrow();
    await engine.archiveAccount(dollars.id);
    await expect(
      engine.recordTransfer({ ...ok, toAccountId: dollars.id, fromAmount: 1, toAmount: 1 }),
    ).rejects.toThrow(/archived/i);
    expect(await engine.listTransfers()).toEqual([]);
    expect(await engine.listTransactions()).toEqual([]);
  });
});

describe("changing and deleting a Transfer", () => {
  it("updates legs, accounts, date and the fee in one write", async () => {
    const { engine, rupiah, wallet, dollars, fees } = await setup();
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 500_000,
      toAmount: 500_000,
      fee: { amount: 6_500, categoryId: fees.id },
    });

    const updated = await engine.updateTransfer(transfer.id, {
      date: "2026-10-20",
      toAccountId: dollars.id,
      fromAmount: 1_600_000,
      toAmount: 9_800,
      fee: { amount: 7_000, categoryId: fees.id },
    });

    expect(updated).toMatchObject({ date: "2026-10-20", toAccountId: dollars.id });
    expect(await engine.getBalance(rupiah.id)).toBe(5_000_000 - 1_600_000 - 7_000);
    expect(await engine.getBalance(wallet.id)).toBe(100_000);
    expect(await engine.getBalance(dollars.id)).toBe(19_800);
    const fee = (await engine.listTransactions())[0]!;
    expect(fee).toMatchObject({ total: -7_000, date: "2026-10-20" });
  });

  it("removes the fee when asked, and adds one later", async () => {
    const { engine, rupiah, wallet, fees } = await setup();
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 100,
      toAmount: 100,
      fee: { amount: 50, categoryId: fees.id },
    });
    await engine.updateTransfer(transfer.id, { fee: null });
    expect(await engine.listTransactions()).toEqual([]);
    expect((await engine.getTransfer(transfer.id))!.fee).toBeUndefined();
    expect(await engine.getBalance(rupiah.id)).toBe(4_999_900);

    await engine.updateTransfer(transfer.id, { fee: { amount: 25, categoryId: fees.id } });
    expect(await engine.listTransactions()).toHaveLength(1);
    expect(await engine.getBalance(rupiah.id)).toBe(4_999_875);
  });

  it("changes nothing when an update is invalid", async () => {
    const { engine, rupiah, wallet } = await setup();
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 100,
      toAmount: 100,
    });
    await expect(
      engine.updateTransfer(transfer.id, { date: "2026-10-21", toAmount: 50 }),
    ).rejects.toThrow();
    expect(await engine.getTransfer(transfer.id)).toEqual(transfer);
  });

  it("deletes the Transfer and its fee, and the balances come back", async () => {
    const { engine, rupiah, wallet, fees } = await setup();
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 500_000,
      toAmount: 500_000,
      fee: { amount: 6_500, categoryId: fees.id },
    });
    await engine.deleteTransfer(transfer.id);
    expect(await engine.listTransfers()).toEqual([]);
    expect(await engine.listTransactions()).toEqual([]);
    expect(await engine.getBalance(rupiah.id)).toBe(5_000_000);
    expect(await engine.getBalance(wallet.id)).toBe(100_000);
    await expect(engine.deleteTransfer(transfer.id)).rejects.toThrow();
  });

  it("keeps the fee tied to its Transfer: it cannot be edited or deleted on its own", async () => {
    const { engine, rupiah, wallet, fees } = await setup();
    await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 100,
      toAmount: 100,
      fee: { amount: 50, categoryId: fees.id },
    });
    const fee = (await engine.listTransactions())[0]!;
    await expect(engine.deleteTransaction(fee.id)).rejects.toThrow(/transfer/i);
    await expect(engine.editTransaction(fee.id, { note: "x" })).rejects.toThrow(/transfer/i);
    await expect(
      engine.updateTransaction(fee.id, {}, [{ categoryId: fees.id, amount: -1 }]),
    ).rejects.toThrow(/transfer/i);
  });
});

describe("Accounts with a Transfer", () => {
  it("count it as history: the currency locks and the Account can only be archived", async () => {
    const { engine, rupiah, wallet } = await setup();
    await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 100,
      toAmount: 100,
    });
    await expect(engine.editAccount(wallet.id, { currency: "USD" })).rejects.toThrow(/currency/i);
    await expect(engine.deleteAccount(wallet.id)).rejects.toThrow(/archive/i);
  });
});

describe("Transfers on another device", () => {
  it("merge into the same balances and survive a restart", async () => {
    const { engine, rupiah, wallet, fees } = await setup();
    await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 500_000,
      toAmount: 500_000,
      fee: { amount: 6_500, categoryId: fees.id },
    });
    const other = await createEngine({
      deviceId: "dev-b",
      clock: createManualClock(NOW),
      random: createSeededRandom(9),
      store: createMemoryStore(),
    });
    await other.applyOps(await engine.exportOps());
    expect(await other.getBalance(rupiah.id)).toBe(await engine.getBalance(rupiah.id));
    expect(await other.getBalance(wallet.id)).toBe(600_000);
    expect(await other.listTransfers()).toEqual(await engine.listTransfers());
  });
});

describe("Transfers merged from two devices", () => {
  async function twoDevices() {
    const { engine, rupiah, wallet, fees } = await setup();
    const other = await createEngine({
      deviceId: "dev-b",
      clock: createManualClock(NOW),
      random: createSeededRandom(9),
      store: createMemoryStore(),
    });
    const transfer = await engine.recordTransfer({
      ...base,
      fromAccountId: rupiah.id,
      toAccountId: wallet.id,
      fromAmount: 100_000,
      toAmount: 100_000,
    });
    await other.applyOps(await engine.exportOps());
    return { engine, other, transfer, rupiah, fees };
  }

  it("charges one fee when both devices add a fee before they sync", async () => {
    const { engine, other, transfer, rupiah, fees } = await twoDevices();
    await engine.updateTransfer(transfer.id, { fee: { amount: 5_000, categoryId: fees.id } });
    await other.updateTransfer(transfer.id, { fee: { amount: 5_000, categoryId: fees.id } });
    await engine.applyOps(await other.exportOps());
    await other.applyOps(await engine.exportOps());
    expect(await engine.listTransactions()).toHaveLength(1);
    expect(await engine.getBalance(rupiah.id)).toBe(5_000_000 - 100_000 - 5_000);
    expect(await other.getBalance(rupiah.id)).toBe(await engine.getBalance(rupiah.id));
  });

  it("leaves no stray fee when one device deletes the Transfer as the other adds a fee", async () => {
    const { engine, other, transfer, rupiah, fees } = await twoDevices();
    await engine.deleteTransfer(transfer.id);
    await other.updateTransfer(transfer.id, { fee: { amount: 5_000, categoryId: fees.id } });
    await engine.applyOps(await other.exportOps());
    await other.applyOps(await engine.exportOps());
    for (const device of [engine, other]) {
      expect(await device.listTransfers()).toEqual([]);
      expect(await device.listTransactions()).toEqual([]);
      expect(await device.getBalance(rupiah.id)).toBe(5_000_000);
    }
  });

  it("brings a removed fee back when one is added again", async () => {
    const { engine, transfer, rupiah, fees } = await twoDevices();
    await engine.updateTransfer(transfer.id, { fee: { amount: 5_000, categoryId: fees.id } });
    await engine.updateTransfer(transfer.id, { fee: null });
    await engine.updateTransfer(transfer.id, { fee: { amount: 7_000, categoryId: fees.id } });
    expect((await engine.getTransfer(transfer.id))!.fee).toEqual({
      amount: 7_000,
      categoryId: fees.id,
    });
    expect(await engine.getBalance(rupiah.id)).toBe(5_000_000 - 100_000 - 7_000);
  });

  it("still edits a Transfer after its fee Category was deleted elsewhere", async () => {
    const { engine, transfer, fees } = await twoDevices();
    await engine.updateTransfer(transfer.id, { fee: { amount: 5_000, categoryId: fees.id } });
    // The Category stays used, so delete is refused; merge it away instead.
    const other = await engine.createCategory({ name: "Charges", kind: "expense" });
    await engine.mergeCategory(fees.id, other.id);
    const updated = await engine.updateTransfer(transfer.id, { note: "hello" });
    expect(updated.note).toBe("hello");
    expect(updated.fee).toEqual({ amount: 5_000, categoryId: other.id });
  });
});
