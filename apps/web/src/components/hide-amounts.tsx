import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { HIDDEN_DOTS } from "./amount";

const STORAGE_KEY = "pfa.hideAmounts";
const START_KEY = "pfa.hideAmountsStart";

/** What the app does with hide-amounts when it opens. Per device, never synced. */
export const HIDE_START_CHOICES = ["remember", "hidden", "shown"] as const;
export type HideStart = (typeof HIDE_START_CHOICES)[number];

interface HideAmounts {
  hidden: boolean;
  toggle: () => void;
  start: HideStart;
  setStart: (start: HideStart) => void;
}

const HideAmountsContext = createContext<HideAmounts>({
  hidden: false,
  toggle: () => {},
  start: "remember",
  setStart: () => {},
});

function readStart(): HideStart {
  try {
    const stored = localStorage.getItem(START_KEY);
    return HIDE_START_CHOICES.includes(stored as HideStart) ? (stored as HideStart) : "remember";
  } catch {
    return "remember";
  }
}

function openingState(start: HideStart): boolean {
  return start === "hidden" ? true : start === "shown" ? false : readStored();
}

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function store(hidden: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    // Storage can be blocked; the choice then lasts only for this session.
  }
}

/** Device-local choice to show dots instead of numbers. Remembered per device, never synced. */
export function HideAmountsProvider({
  children,
  initialHidden,
}: {
  children: ReactNode;
  initialHidden?: boolean;
}) {
  const [start, setCurrentStart] = useState<HideStart>(readStart);
  const [hidden, setHidden] = useState(() => initialHidden ?? openingState(start));
  const toggle = useCallback(() => {
    const next = !hidden;
    // Only "remember" carries a choice over to the next time the app opens.
    if (start === "remember") store(next);
    setHidden(next);
  }, [hidden, start]);
  const setStart = useCallback((next: HideStart) => {
    try {
      localStorage.setItem(START_KEY, next);
    } catch {
      // The choice then lasts only for this session.
    }
    setCurrentStart(next);
  }, []);
  const value = useMemo(
    () => ({ hidden, toggle, start, setStart }),
    [hidden, toggle, start, setStart],
  );
  return <HideAmountsContext.Provider value={value}>{children}</HideAmountsContext.Provider>;
}

export function useHideAmounts(): HideAmounts {
  return useContext(HideAmountsContext);
}

export function HideAmountsToggle() {
  const { hidden, toggle } = useHideAmounts();
  return (
    <button
      type="button"
      aria-pressed={hidden}
      onClick={toggle}
      className="min-h-11 min-w-11 rounded-lg border border-line bg-surface px-3 text-ink"
    >
      {m.hide_amounts()}
    </button>
  );
}

/** Formats an amount for plain text, or dots while amounts are hidden. */
export function useMoneyText(): (formatted: string) => string {
  const { hidden } = useHideAmounts();
  return (formatted) => (hidden ? HIDDEN_DOTS : formatted);
}
