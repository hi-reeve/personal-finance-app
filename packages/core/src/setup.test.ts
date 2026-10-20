import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore, dismissFullBannerUntil, localOnlyBanner } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

async function device(store = createMemoryStore(), seed = 1) {
  const clock = createManualClock(NOW);
  const engine = await createEngine({
    deviceId: "dev-a",
    clock,
    random: createSeededRandom(seed),
    store,
  });
  return { engine, clock, store };
}

const wallet = { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 } as const;

describe("first run", () => {
  it("starts with nothing set up", async () => {
    const { engine } = await device();
    expect(engine.getSettings()).toEqual({});
    expect(await engine.listAccounts()).toEqual([]);
  });

  it("sets the base currency and creates the first Account together", async () => {
    const { engine } = await device();
    const account = await engine.completeSetup({ baseCurrency: "IDR", account: wallet });

    expect(account).toMatchObject({ ...wallet, createdAt: NOW });
    expect(account.id).toMatch(UUID_V7);
    expect(engine.getSettings()).toEqual({
      baseCurrency: "IDR",
      setupAt: NOW,
      defaultAccountId: account.id,
    });
    expect(await engine.listAccounts()).toEqual([account]);
  });

  it("is still there after the app restarts on the same store", async () => {
    const first = await device();
    const account = await first.engine.completeSetup({
      baseCurrency: "USD",
      account: { name: "Chase", kind: "bank", currency: "USD", openingBalance: 150_000 },
    });

    const restarted = await device(first.store, 2);
    expect(restarted.engine.getSettings()).toEqual({
      baseCurrency: "USD",
      setupAt: NOW,
      defaultAccountId: account.id,
    });
    expect(await restarted.engine.listAccounts()).toEqual([account]);
  });

  it("refuses to run twice, so a second device or tab cannot reset the base currency", async () => {
    const { engine } = await device();
    await engine.completeSetup({ baseCurrency: "IDR", account: wallet });
    await expect(engine.completeSetup({ baseCurrency: "USD", account: wallet })).rejects.toThrow();
    expect(engine.getSettings().baseCurrency).toBe("IDR");
    expect(await engine.listAccounts()).toHaveLength(1);
  });

  it("rejects an unusable first Account and leaves nothing behind", async () => {
    const { engine, store } = await device();
    for (const account of [
      { ...wallet, name: "   " },
      { ...wallet, kind: "piggy" as never },
      { ...wallet, currency: "XXX" as never },
      { ...wallet, openingBalance: 1.5 },
    ]) {
      await expect(engine.completeSetup({ baseCurrency: "IDR", account })).rejects.toThrow();
    }
    await expect(
      engine.completeSetup({ baseCurrency: "XXX" as never, account: wallet }),
    ).rejects.toThrow();
    expect(await store.readAll()).toEqual([]);
    expect(engine.getSettings()).toEqual({});
  });

  it("writes setup as a single batch, so a crash cannot leave a currency without an Account", async () => {
    const appended: number[] = [];
    const inner = createMemoryStore();
    const store = {
      ...inner,
      async append(ops: Parameters<typeof inner.append>[0]) {
        appended.push(ops.length);
        await inner.append(ops);
      },
    };
    const { engine } = await device(store);
    await engine.completeSetup({ baseCurrency: "IDR", account: wallet });
    expect(appended).toHaveLength(1);
  });
});

describe("Accounts", () => {
  it("adds more Accounts after setup and lists them oldest first", async () => {
    const { engine, clock } = await device();
    const first = await engine.completeSetup({ baseCurrency: "IDR", account: wallet });
    clock.advance(1_000);
    const second = await engine.createAccount({
      name: "BCA",
      kind: "bank",
      currency: "IDR",
      openingBalance: 5_000_000,
    });
    expect(await engine.listAccounts()).toEqual([first, second]);
  });

  it("merges Accounts created on two devices", async () => {
    const a = await device(createMemoryStore(), 1);
    const b = await device(createMemoryStore(), 2);
    const cash = await a.engine.createAccount(wallet);
    const bank = await b.engine.createAccount({ ...wallet, name: "BCA", kind: "bank" });
    await a.engine.applyOps(await b.engine.exportOps());
    await b.engine.applyOps(await a.engine.exportOps());
    const names = async (e: typeof a.engine) => (await e.listAccounts()).map((x) => x.id).sort();
    expect(await names(a.engine)).toEqual([cash.id, bank.id].sort());
    expect(await names(b.engine)).toEqual(await names(a.engine));
  });
});

describe("local-only banner", () => {
  const base = { syncOn: false, setupAt: NOW, now: NOW + 1_000, transactions: 0 };

  it("is gentle at first", () => {
    expect(localOnlyBanner(base)).toBe("gentle");
  });

  it("goes away once sync is on", () => {
    expect(localOnlyBanner({ ...base, syncOn: true, transactions: 99 })).toBe("none");
  });

  it("gets stronger after 10 transactions", () => {
    expect(localOnlyBanner({ ...base, transactions: 9 })).toBe("gentle");
    expect(localOnlyBanner({ ...base, transactions: 10 })).toBe("strong");
  });

  it("goes full-screen after 25 transactions", () => {
    expect(localOnlyBanner({ ...base, transactions: 24 })).toBe("strong");
    expect(localOnlyBanner({ ...base, transactions: 25 })).toBe("full");
  });

  it("goes full-screen after 7 days, even with no transactions", () => {
    expect(localOnlyBanner({ ...base, now: NOW + 7 * DAY - 1 })).toBe("gentle");
    expect(localOnlyBanner({ ...base, now: NOW + 7 * DAY })).toBe("full");
  });

  it("can be dismissed for a day, falling back to the strong banner, never to nothing", () => {
    const due = { ...base, transactions: 30 };
    const until = dismissFullBannerUntil(due.now);
    expect(until).toBe(due.now + DAY);
    expect(localOnlyBanner({ ...due, dismissedUntil: until })).toBe("strong");
    expect(localOnlyBanner({ ...due, now: until - 1, dismissedUntil: until })).toBe("strong");
    expect(localOnlyBanner({ ...due, now: until, dismissedUntil: until })).toBe("full");
  });

  it("does not let a dismissal hide the gentle banner", () => {
    expect(localOnlyBanner({ ...base, dismissedUntil: base.now + DAY })).toBe("gentle");
  });
});
