import type { CurrencyCode } from "@pfa/core";
import { useEffect, useState } from "react";
import { rateProvider } from "../app/rates";

export type TodaysRates =
  | { status: "loading" }
  /** Each currency that answered; one that did not is simply absent: no rate, never a guess. */
  | { status: "ready"; rates: Record<string, string> };

export type ViewRate = { status: "loading" } | { status: "ready"; rate: string | undefined };

/** A lookup that fails counts as no answer: the person is told there is no rate, not left waiting. */
const lookup = (date: string, from: CurrencyCode, to: CurrencyCode) =>
  rateProvider.lookup(date, from, to).catch(() => undefined);

/**
 * Today's rate from each of these currencies into the base. Nothing is fetched while `currencies`
 * is empty. Rates already seen come from this device's memory, so offline still answers for them.
 */
export function useTodaysRates(
  currencies: readonly CurrencyCode[],
  base: CurrencyCode | undefined,
  today: string,
): TodaysRates {
  const wanted = [...new Set(currencies)].filter((c) => c !== base).sort();
  const key = `${base}|${today}|${wanted.join(",")}`;
  // Answers are kept with what they answered, so a change of question never shows the old answer.
  const [answer, setAnswer] = useState<{ key: string; rates: Record<string, string> }>();
  useEffect(() => {
    if (base === undefined) return;
    let live = true;
    Promise.all(
      wanted.map(async (code) => [code, (await lookup(today, code, base))?.rate] as const),
    ).then((answers) => {
      if (!live) return;
      const rates: Record<string, string> = {};
      for (const [code, rate] of answers) if (rate !== undefined) rates[code] = rate;
      setAnswer({ key, rates });
    });
    return () => {
      live = false;
    };
    // `key` stands for everything the lookups depend on.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return answer?.key === key ? { status: "ready", rates: answer.rates } : { status: "loading" };
}

/** Today's rate from the base currency into the display currency, or none when it has no answer. */
export function useViewRate(
  base: CurrencyCode | undefined,
  display: CurrencyCode | undefined,
  today: string,
): ViewRate {
  const key = `${base}|${display}|${today}`;
  const [answer, setAnswer] = useState<{ key: string; rate: string | undefined }>();
  useEffect(() => {
    if (base === undefined || display === undefined) return;
    let live = true;
    lookup(today, base, display).then((found) => {
      if (live) setAnswer({ key, rate: found?.rate });
    });
    return () => {
      live = false;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return answer?.key === key ? { status: "ready", rate: answer.rate } : { status: "loading" };
}
