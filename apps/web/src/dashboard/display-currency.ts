import { currencyCodes, type CurrencyCode } from "@pfa/core";
import { useCallback, useState } from "react";
import { DEVICE_STORAGE_KEYS } from "../settings/scopes";

const KEY = DEVICE_STORAGE_KEYS.displayCurrency;

function read(): CurrencyCode | undefined {
  try {
    const stored = localStorage.getItem(KEY);
    return currencyCodes.includes(stored as CurrencyCode) ? (stored as CurrencyCode) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The currency to show totals in as well, as a view. Per device, never synced, and never written
 * to the data: the records stay in the base currency.
 */
export function useDisplayCurrency(): [
  CurrencyCode | undefined,
  (code: CurrencyCode | undefined) => void,
] {
  const [code, setCode] = useState<CurrencyCode | undefined>(read);
  const set = useCallback((next: CurrencyCode | undefined) => {
    try {
      if (next === undefined) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts only for this visit.
    }
    setCode(next);
  }, []);
  return [code, set];
}
