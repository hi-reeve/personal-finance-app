import { describe, expect, it } from "vite-plus/test";
import { BALANCE_ADJUSTMENT_CATEGORY, createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function device(store = createMemoryStore()) {
  const engine = await createEngine({
    deviceId: "dev-a",
    clock: createManualClock(NOW),
    random: createSeededRandom(1),
    store,
  });
  return { engine, store };
}

const wallet = { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 100_000 } as const;
const spend = (accountId: string, amount: number) => ({
  accountId,
  date: "2026-10-18",
  lines: [{ categoryId: "cat-food", amount }],
});

describe("Account balance", () => {
  it("is the opening balance plus every live Transaction", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    expect(await engine.getBalance(account.id)).toBe(100_000);

    await engine.recordTransaction(spend(account.id, -25_000));
    const second = await engine.recordTransaction(spend(account.id, -5_000));
    expect(await engine.getBalance(account.id)).toBe(70_000);

    await engine.deleteTransaction(second.id);
    expect(await engine.getBalance(account.id)).toBe(75_000);
  });

  it("ignores other Accounts", async () => {
    const { engine } = await device();
    const a = await engine.createAccount(wallet);
    const b = await engine.createAccount({ ...wallet, name: "Bank" });
    await engine.recordTransaction(spend(b.id, -1_000));
    expect(await engine.getBalance(a.id)).toBe(100_000);
  });

  it("rejects an Account that does not exist", async () => {
    const { engine } = await device();
    await expect(engine.getBalance("nope")).rejects.toThrow();
  });
});

describe("balance adjustment", () => {
  it("records a Transaction in the Balance adjustment Category that reaches the target", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    await engine.recordTransaction(spend(account.id, -25_000));

    const adjustment = await engine.adjustBalance(account.id, {
      target: 90_000,
      date: "2026-10-19",
    });

    expect(adjustment.lines).toMatchObject([
      { categoryId: BALANCE_ADJUSTMENT_CATEGORY, amount: 15_000 },
    ]);
    expect(adjustment.accountId).toBe(account.id);
    expect(await engine.getBalance(account.id)).toBe(90_000);
  });

  it("goes down as well as up, and refuses when there is nothing to adjust", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    const down = await engine.adjustBalance(account.id, { target: 40_000, date: "2026-10-19" });
    expect(down.total).toBe(-60_000);
    await expect(
      engine.adjustBalance(account.id, { target: 40_000, date: "2026-10-19" }),
    ).rejects.toThrow();
  });
});

describe("editing an Account", () => {
  it("changes name, icon, colour and the liability flag", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    const edited = await engine.editAccount(account.id, {
      name: "  Cash on hand ",
      icon: "wallet",
      color: "teal",
      isLiability: true,
    });
    expect(edited).toMatchObject({
      name: "Cash on hand",
      icon: "wallet",
      color: "teal",
      isLiability: true,
    });
    expect((await engine.listAccounts())[0]).toEqual(edited);
  });

  it("marks a credit card as a liability unless told otherwise", async () => {
    const { engine } = await device();
    const card = await engine.createAccount({ ...wallet, name: "Card", kind: "credit-card" });
    const bank = await engine.createAccount({ ...wallet, name: "Bank", kind: "bank" });
    expect(card.isLiability).toBe(true);
    expect(bank.isLiability).toBe(false);
  });

  it("rejects a blank name and unknown icons or colours", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    await expect(engine.editAccount(account.id, { name: "  " })).rejects.toThrow();
    await expect(engine.editAccount(account.id, { icon: "nope" as never })).rejects.toThrow();
    await expect(engine.editAccount(account.id, { color: "nope" as never })).rejects.toThrow();
  });

  it("locks the currency once the Account has Transactions", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    expect((await engine.editAccount(account.id, { currency: "USD" })).currency).toBe("USD");

    await engine.recordTransaction(spend(account.id, -100));
    await expect(engine.editAccount(account.id, { currency: "IDR" })).rejects.toThrow(/currency/i);
    expect((await engine.listAccounts())[0]!.currency).toBe("USD");
    // Same currency is not a change.
    await expect(engine.editAccount(account.id, { currency: "USD" })).resolves.toBeDefined();
  });
});

describe("archiving and deleting", () => {
  it("deletes an Account with no history", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    await engine.deleteAccount(account.id);
    expect(await engine.listAccounts()).toEqual([]);
  });

  it("only archives an Account that has history, and can bring it back", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    await engine.recordTransaction(spend(account.id, -100));

    await expect(engine.deleteAccount(account.id)).rejects.toThrow(/archive/i);

    await engine.archiveAccount(account.id);
    const [archived] = await engine.listAccounts();
    expect(archived!.archivedAt).toBe(NOW);
    expect(await engine.getBalance(account.id)).toBe(99_900);

    await engine.unarchiveAccount(account.id);
    expect((await engine.listAccounts())[0]!.archivedAt).toBeUndefined();
  });

  it("treats an Account whose Transactions were all deleted as having no history", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    const tx = await engine.recordTransaction(spend(account.id, -100));
    await engine.deleteTransaction(tx.id);
    await engine.deleteAccount(account.id);
    expect(await engine.listAccounts()).toEqual([]);
  });

  it("rejects new Transactions on an archived or deleted Account", async () => {
    const { engine } = await device();
    const account = await engine.createAccount(wallet);
    await engine.archiveAccount(account.id);
    await expect(engine.recordTransaction(spend(account.id, -1))).rejects.toThrow();
    await engine.unarchiveAccount(account.id);
    await engine.deleteAccount(account.id);
    await expect(engine.recordTransaction(spend(account.id, -1))).rejects.toThrow();
  });
});

describe("default Account", () => {
  it("is chosen in settings and survives a restart", async () => {
    const first = await device();
    const a = await first.engine.createAccount(wallet);
    const b = await first.engine.createAccount({ ...wallet, name: "Bank" });
    expect(first.engine.getSettings().defaultAccountId).toBeUndefined();

    await first.engine.setDefaultAccount(b.id);
    expect(first.engine.getSettings().defaultAccountId).toBe(b.id);
    await first.engine.setDefaultAccount(a.id);

    const restarted = await device(first.store);
    expect(restarted.engine.getSettings().defaultAccountId).toBe(a.id);
  });

  it("is forgotten when the Account is archived or deleted, and can be cleared", async () => {
    const { engine } = await device();
    const a = await engine.createAccount(wallet);
    await engine.setDefaultAccount(a.id);
    await engine.archiveAccount(a.id);
    expect(engine.getSettings().defaultAccountId).toBeUndefined();
    await expect(engine.setDefaultAccount(a.id)).rejects.toThrow();

    await engine.unarchiveAccount(a.id);
    await engine.setDefaultAccount(a.id);
    await engine.setDefaultAccount(undefined);
    expect(engine.getSettings().defaultAccountId).toBeUndefined();
  });
});

describe("merging devices", () => {
  it("applies an archive made on another device", async () => {
    const one = await device();
    const two = await device();
    const account = await one.engine.createAccount(wallet);
    await one.engine.archiveAccount(account.id);
    await two.engine.applyOps(await one.engine.exportOps());
    expect((await two.engine.listAccounts())[0]!.archivedAt).toBe(NOW);
  });
});
