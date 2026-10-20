import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function setup(store = createMemoryStore(), device = "dev-a") {
  const engine = await createEngine({
    deviceId: device,
    clock: createManualClock(NOW),
    random: createSeededRandom(device === "dev-a" ? 1 : 2),
    store,
  });
  return { engine, store };
}

async function withAccounts() {
  const { engine, store } = await setup();
  const wallet = await engine.completeSetup({
    baseCurrency: "IDR",
    account: { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 1_000_000 },
  });
  const card = await engine.createAccount({
    name: "Wise",
    kind: "bank",
    currency: "USD",
    openingBalance: 100_000,
  });
  const food = await engine.createCategory({ name: "Food", kind: "expense" });
  return { engine, store, wallet, card, food };
}

describe("a Transaction in another currency", () => {
  it("keeps the rate it was entered with and converts at that rate", async () => {
    const { engine, card, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: card.id,
      date: "2026-10-18",
      rate: "16250.5",
      lines: [
        { categoryId: food.id, amount: -1_200 },
        { categoryId: food.id, amount: -300 },
      ],
    });
    expect(tx.rate).toBe("16250.5");
    expect(await engine.getBaseAmounts(tx.id)).toEqual({
      lines: [-195_006, -48_752], // $12.00 and $3.00 (48,751.5 rounds away from zero)
      total: -243_758,
    });
    // The Account keeps its own currency: the balance is not converted.
    expect(await engine.getBalance(card.id)).toBe(100_000 - 1_500);
  });

  it("needs a rate, because a missing one cannot be guessed", async () => {
    const { engine, card, food } = await withAccounts();
    await expect(
      engine.recordTransaction({
        accountId: card.id,
        date: "2026-10-18",
        lines: [{ categoryId: food.id, amount: -1_200 }],
      }),
    ).rejects.toThrow(/rate/i);
    await expect(
      engine.recordTransaction({
        accountId: card.id,
        date: "2026-10-18",
        rate: "free",
        lines: [{ categoryId: food.id, amount: -1_200 }],
      }),
    ).rejects.toThrow(/rate/i);
    expect(await engine.listTransactions()).toEqual([]);
  });

  it("has no rate in the base currency, and counts in it directly", async () => {
    const { engine, wallet, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: wallet.id,
      date: "2026-10-18",
      lines: [{ categoryId: food.id, amount: -25_000 }],
    });
    expect(tx.rate).toBeUndefined();
    expect(await engine.getBaseAmounts(tx.id)).toEqual({
      lines: [-25_000],
      total: -25_000,
    });
    await expect(
      engine.recordTransaction({
        accountId: wallet.id,
        date: "2026-10-18",
        rate: "2",
        lines: [{ categoryId: food.id, amount: -1 }],
      }),
    ).rejects.toThrow(/base currency/i);
  });

  it("stays frozen: only the Transaction's own rate matters, never a later one", async () => {
    const { engine, card, food } = await withAccounts();
    const early = await engine.recordTransaction({
      accountId: card.id,
      date: "2026-09-01",
      rate: "15000",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    await engine.recordTransaction({
      accountId: card.id,
      date: "2026-10-18",
      rate: "17000",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    expect((await engine.getBaseAmounts(early.id))!.total).toBe(-150_000);
  });

  it("can be corrected by hand, and the base amount follows the new rate", async () => {
    const { engine, card, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: card.id,
      date: "2026-10-18",
      rate: "16000",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    await engine.updateTransaction(tx.id, { rate: "16500" }, [
      { id: tx.lines[0]!.id, categoryId: food.id, amount: -1_000 },
    ]);
    expect((await engine.getBaseAmounts(tx.id))!.total).toBe(-165_000);
    await expect(engine.editTransaction(tx.id, { rate: "oops" })).rejects.toThrow(/rate/i);
  });

  it("moving to another Account asks for a matching rate", async () => {
    const { engine, wallet, card, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: card.id,
      date: "2026-10-18",
      rate: "16000",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    // To a base-currency Account: the rate goes away.
    await engine.editTransaction(tx.id, { accountId: wallet.id });
    expect((await engine.getTransaction(tx.id))!.rate).toBeUndefined();
    // Back to the foreign one needs a rate again.
    await expect(engine.editTransaction(tx.id, { accountId: card.id })).rejects.toThrow(/rate/i);
    await engine.editTransaction(tx.id, { accountId: card.id, rate: "16100" });
    expect((await engine.getTransaction(tx.id))!.rate).toBe("16100");
  });

  it("lets an unrelated edit through even on an old Transaction that has no rate", async () => {
    const { engine, store, card, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: card.id,
      date: "2026-10-18",
      rate: "16000",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    // Same data as an old build would have written: no rate field at all.
    const oldOps = (await store.readAll()).filter((op) => op.field !== "rate");
    const { engine: old } = await setup(createMemoryStore(), "dev-c");
    await old.applyOps(oldOps);
    expect((await old.getTransaction(tx.id))!.rate).toBeUndefined();
    await expect(old.editTransaction(tx.id, { note: "ok" })).resolves.toBeUndefined();
    expect(await old.getBaseAmounts(tx.id)).toBeUndefined();
  });
});

describe("a Balance adjustment on a foreign Account", () => {
  it("needs no rate, because reports leave it out", async () => {
    const { engine, card } = await withAccounts();
    const adjustment = await engine.adjustBalance(card.id, { target: 90_000, date: "2026-10-18" });
    expect(adjustment.rate).toBeUndefined();
    expect(await engine.getBalance(card.id)).toBe(90_000);
    expect(await engine.getBaseAmounts(adjustment.id)).toBeUndefined();
  });
});

describe("an original amount", () => {
  it("is kept for display and never changes the money", async () => {
    const { engine, wallet, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: wallet.id,
      date: "2026-10-18",
      original: { amount: 1_200, currency: "USD" },
      lines: [{ categoryId: food.id, amount: -195_000 }],
    });
    expect(tx.original).toEqual({ amount: 1_200, currency: "USD" });
    expect(tx.total).toBe(-195_000);
    expect(await engine.getBalance(wallet.id)).toBe(805_000);
    expect((await engine.getBaseAmounts(tx.id))!.total).toBe(-195_000);
  });

  it("can be changed and removed, and must be a real amount", async () => {
    const { engine, wallet, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: wallet.id,
      date: "2026-10-18",
      lines: [{ categoryId: food.id, amount: -195_000 }],
    });
    await engine.editTransaction(tx.id, { original: { amount: 1_200, currency: "USD" } });
    expect((await engine.getTransaction(tx.id))!.original).toEqual({
      amount: 1_200,
      currency: "USD",
    });
    await engine.editTransaction(tx.id, { original: null });
    expect((await engine.getTransaction(tx.id))!.original).toBeUndefined();

    await expect(
      engine.editTransaction(tx.id, { original: { amount: 0, currency: "USD" } }),
    ).rejects.toThrow();
    await expect(
      engine.editTransaction(tx.id, { original: { amount: 5, currency: "ZZZ" as never } }),
    ).rejects.toThrow();
  });
});

describe("a Transfer fee in another currency", () => {
  it("needs a rate for the fee when it is charged in a foreign Account", async () => {
    const { engine, wallet, card, food } = await withAccounts();
    const input = {
      date: "2026-10-18",
      fromAccountId: card.id,
      toAccountId: wallet.id,
      fromAmount: 1_000,
      toAmount: 16_000_000,
    };
    await expect(
      engine.recordTransfer({ ...input, fee: { amount: 50, categoryId: food.id } }),
    ).rejects.toThrow(/rate/i);
    const transfer = await engine.recordTransfer({
      ...input,
      fee: { amount: 50, categoryId: food.id, rate: "16000" },
    });
    expect(transfer.fee).toEqual({ amount: 50, categoryId: food.id, rate: "16000" });
    const fee = (await engine.listTransactions())[0]!;
    expect((await engine.getBaseAmounts(fee.id))!.total).toBe(-8_000);
  });
});

describe("rates on another device", () => {
  it("merge and survive a restart", async () => {
    const { engine, store, card, food } = await withAccounts();
    const tx = await engine.recordTransaction({
      accountId: card.id,
      date: "2026-10-18",
      rate: "16250.5",
      original: { amount: 5, currency: "EUR" },
      lines: [{ categoryId: food.id, amount: -1_200 }],
    });
    const other = (await setup(createMemoryStore(), "dev-b")).engine;
    await other.applyOps(await engine.exportOps());
    expect(await other.getTransaction(tx.id)).toEqual(await engine.getTransaction(tx.id));
    expect((await other.getBaseAmounts(tx.id))!.total).toBe(-195_006 - 0);
    const again = (await setup(store)).engine;
    expect((await again.getTransaction(tx.id))!.rate).toBe("16250.5");
  });
});
