import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "pfa.hideAmounts";

interface HideAmounts {
  hidden: boolean;
  toggle: () => void;
}

const HideAmountsContext = createContext<HideAmounts>({ hidden: false, toggle: () => {} });

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
  const [hidden, setHidden] = useState(() => initialHidden ?? readStored());
  const toggle = useCallback(() => {
    const next = !hidden;
    store(next);
    setHidden(next);
  }, [hidden]);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
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
      Hide amounts
    </button>
  );
}
