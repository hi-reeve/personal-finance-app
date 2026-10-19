import {
  createEngine,
  type Account,
  type CurrencyCode,
  type Engine,
  type NewAccount,
  type Settings,
} from "@pfa/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { openWebStore } from "../storage/web-store";

const DEVICE_KEY = "pfa.device-id";

function deviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return stored;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
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

export interface Snapshot {
  settings: Settings;
  accounts: Account[];
  transactions: number;
}

export type AppState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | ({ status: "ready"; completeSetup: CompleteSetup } & Snapshot);

type CompleteSetup = (input: { baseCurrency: CurrencyCode; account: NewAccount }) => Promise<void>;

const AppContext = createContext<AppState>({ status: "loading" });

async function snapshot(engine: Engine): Promise<Snapshot> {
  const [accounts, transactions] = await Promise.all([
    engine.listAccounts(),
    engine.listTransactions(),
  ]);
  return { settings: engine.getSettings(), accounts, transactions: transactions.length };
}

/** Opens the user's data once and keeps a current view of it for the screens. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({ status: "loading" });

  const completeSetup = useCallback<CompleteSetup>(async (input) => {
    const engine = await openEngine();
    await engine.completeSetup(input);
    const next = await snapshot(engine);
    setState((current) => (current.status === "ready" ? { ...current, ...next } : current));
  }, []);

  useEffect(() => {
    let live = true;
    openEngine()
      .then(snapshot)
      .then(
        (next) => live && setState({ status: "ready", completeSetup, ...next }),
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
  }, [completeSetup]);

  const value = useMemo(() => state, [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  return useContext(AppContext);
}
