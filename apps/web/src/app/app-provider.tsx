import {
  createEngine,
  type Account,
  type Budget,
  type Category,
  type CurrencyCode,
  type Engine,
  type NewAccount,
  type Settings,
  type Tag,
  type Transaction,
  type Transfer,
} from "@pfa/core";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { openWebStore } from "../storage/web-store";

const DEVICE_KEY = "pfa.device-id";

let fallbackId: string | undefined;

function deviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    // Storage is blocked: keep one id for this page, so its ops at least order consistently.
    return (fallbackId ??= crypto.randomUUID());
  }
}

let opened: Promise<Engine> | undefined;

/** The one engine for this page, over the user's real database file. */
function openEngine(): Promise<Engine> {
  opened ??= createEngine({
    deviceId: deviceId(),
    clock: { now: () => Date.now() },
    random: { bytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    store: openWebStore(),
  });
  return opened;
}

export interface AccountView extends Account {
  balance: number;
  /** Has live Transactions: it can then only be archived, and its currency is locked. */
  hasHistory: boolean;
}

export interface Snapshot {
  settings: Settings;
  accounts: AccountView[];
  /** Monthly budgets, one per expense Category. */
  budgets: Budget[];
  /** Live Transfers, newest first. */
  transfers: Transfer[];
  /** Live Transactions, newest first; a Transfer's fee is among them. */
  activity: Transaction[];
  categories: Category[];
  /** How many Lines use each Category, by id. */
  categoryUse: Record<string, number>;
  /** Categories on the latest Transactions, for the picker. */
  recentCategories: Category[];
  tags: Tag[];
}

/** Asks the engine a question without changing anything, such as a report. */
type Read = <T>(question: (engine: Engine) => Promise<T>) => Promise<T>;

export type ReadyState = {
  status: "ready";
  completeSetup: CompleteSetup;
  act: Act;
  read: Read;
  /** Goes up after every change, so anything computed from the data knows to ask again. */
  version: number;
} & Snapshot;

export type AppState = { status: "loading" } | { status: "error"; message: string } | ReadyState;

type CompleteSetup = (input: { baseCurrency: CurrencyCode; account: NewAccount }) => Promise<void>;

/** Runs a change on the engine, then refreshes what the screens show. */
type Act = (change: (engine: Engine) => Promise<unknown>) => Promise<void>;

const AppContext = createContext<AppState>({ status: "loading" });

function newestFirst(a: Transaction | Transfer, b: Transaction | Transfer): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt !== b.createdAt ? b.createdAt - a.createdAt : b.id < a.id ? -1 : 1;
}

async function snapshot(engine: Engine): Promise<Snapshot> {
  const [list, transactions] = await Promise.all([
    engine.listAccounts(),
    engine.listTransactions(),
  ]);
  const used = new Set(transactions.map((tx) => tx.accountId));
  const accounts = await Promise.all(
    list.map(async (account) => ({
      ...account,
      balance: await engine.getBalance(account.id),
      hasHistory: used.has(account.id),
    })),
  );
  const categoryUse: Record<string, number> = {};
  for (const tx of transactions)
    for (const line of tx.lines)
      categoryUse[line.categoryId] = (categoryUse[line.categoryId] ?? 0) + 1;
  const [categories, recentCategories, tags] = await Promise.all([
    engine.listCategories(),
    engine.recentCategories(5),
    engine.listTags(),
  ]);
  return {
    settings: engine.getSettings(),
    accounts,
    activity: [...transactions].sort(newestFirst),
    transfers: [...(await engine.listTransfers())].sort(newestFirst),
    categories,
    categoryUse,
    budgets: await engine.listBudgets(),
    recentCategories,
    tags,
  };
}

/** Opens the user's data once and keeps a current view of it for the screens. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({ status: "loading" });

  const completeSetup = useCallback<CompleteSetup>(async (input) => {
    const engine = await openEngine();
    await engine.completeSetup(input);
    const next = await snapshot(engine);
    setState((current) =>
      current.status === "ready" ? { ...current, ...next, version: current.version + 1 } : current,
    );
  }, []);

  const act = useCallback<Act>(async (change) => {
    const engine = await openEngine();
    await change(engine);
    const next = await snapshot(engine);
    setState((current) =>
      current.status === "ready" ? { ...current, ...next, version: current.version + 1 } : current,
    );
  }, []);

  const read = useCallback<Read>(async (question) => question(await openEngine()), []);

  useEffect(() => {
    let live = true;
    openEngine()
      .then(snapshot)
      .then(
        (next) =>
          live && setState({ status: "ready", completeSetup, act, read, version: 0, ...next }),
        (error: unknown) =>
          live &&
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
      );
    return () => {
      live = false;
    };
  }, [completeSetup, act, read]);

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  return useContext(AppContext);
}
