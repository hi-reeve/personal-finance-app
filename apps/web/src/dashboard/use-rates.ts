import type { CurrencyCode } from "@pfa/core";
import { useEffect, useState } from "react";
import { rateProvider } from "../app/rates";

export type TodaysRates =
  | { status: "loading" }
  /** Each currency that answered; one that did not is simply absent: no rate, never a guess. */
  | { status: "ready"; rates: Record<string, string> };

/**
 * Today's rate from each of these currencies into the base. Nothing is fetched while `currencies`
 * is empty. Rates already seen come from this device's memory, so offline still answers for them.
 */
export function useTodaysRates(
  currencies: readonly CurrencyCode[],
  base: CurrencyCode | undefined,
  today: string,
): TodaysRates {
  const [state, setState] = useState<TodaysRates>({ status: "loading" });
  const wanted = [...new Set(currencies)].filter((c) => c !== base).sort();
  const key = wanted.join(",");
  useEffect(() => {
    if (base === undefined) return;
    let live = true;
    setState({ status: "loading" });
    Promise.all(
      key === ""
        ? []
        : key.split(",").map(async (code) => {
            const found = await rateProvider.lookup(today, code as CurrencyCode, base);
            return [code, found?.rate] as const;
          }),
    ).then((answers) => {
      if (!live) return;
      const rates: Record<string, string> = {};
      for (const [code, rate] of answers) if (rate !== undefined) rates[code] = rate;
      setState({ status: "ready", rates });
    });
    return () => {
      live = false;
    };
  }, [key, base, today]);
  return state;
}

export type ViewRate = { status: "loading" } | { status: "ready"; rate: string | undefined };

/** Today's rate from the base currency into the display currency, or none when it has no answer. */
export function useViewRate(
  base: CurrencyCode | undefined,
  display: CurrencyCode | undefined,
  today: string,
): ViewRate {
  const [state, setState] = useState<ViewRate>({ status: "loading" });
  useEffect(() => {
    if (base === undefined || display === undefined) return;
    let live = true;
    setState({ status: "loading" });
    rateProvider.lookup(today, base, display).then((found) => {
      if (live) setState({ status: "ready", rate: found?.rate });
    });
    return () => {
      live = false;
    };
  }, [base, display, today]);
  return state;
}
