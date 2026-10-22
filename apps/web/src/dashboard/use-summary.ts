import {
  shiftMonth,
  type CurrencyCode,
  type DailyTotals,
  type MonthlyTotals,
  type Period,
  type RateEffect,
  type SpendingByCategory,
} from "@pfa/core";
import { useEffect, useState } from "react";
import type { ReadyState } from "../app/app-provider";

export interface SummaryData {
  currency: CurrencyCode;
  period: Period;
  previous: Period;
  spending: SpendingByCategory;
  daily: DailyTotals;
  /** Income for the period, in the base currency. */
  income: number;
  /** Spending for the month before, to compare with. */
  previousSpending: number;
  /** The six months ending with this one. */
  monthly: MonthlyTotals;
  /** Present in "at today's rate" mode: what that changes against the rates as recorded. */
  effect?: RateEffect;
}

export type SummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SummaryData };

/**
 * Everything the Home views show, asked of the report engine for one month. Asks again when the
 * month changes or the data does, so a number on screen is never older than the data.
 */
export function useSummary(
  app: ReadyState,
  period: Period,
  todayRates?: Readonly<Record<string, string>>,
): SummaryState {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const { read, version } = app;
  const base = app.settings.baseCurrency;
  // The rates are plain text, so their text is a stable thing to ask again on.
  const ratesKey = todayRates === undefined ? undefined : JSON.stringify(todayRates);

  useEffect(() => {
    if (base === undefined) return;
    let live = true;
    const previous = shiftMonth(period, -1);
    read(async (engine) => {
      const rates = todayRates === undefined ? {} : { todayRates };
      const [spending, daily, income, before, monthly, effect] = await Promise.all([
        engine.spendingByCategory({ ...period, ...rates }),
        engine.dailyTotals({ ...period, ...rates }),
        engine.spendingByCategory({ ...period, kind: "income", ...rates }),
        engine.spendingByCategory({ ...previous, ...rates }),
        engine.monthlyTotals({ from: shiftMonth(period, -5).from, to: period.to, ...rates }),
        todayRates === undefined ? undefined : engine.rateEffect({ ...period, todayRates }),
      ]);
      return {
        currency: base,
        period,
        previous,
        spending,
        daily,
        income: income.total,
        previousSpending: before.total,
        monthly,
        ...(effect !== undefined ? { effect } : {}),
      } satisfies SummaryData;
    }).then(
      (data) => live && setState({ status: "ready", data }),
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
  }, [read, version, base, period.from, period.to, ratesKey]);

  // Figures for another month are never shown under this month's name.
  return state.status === "ready" && state.data.period.from !== period.from
    ? { status: "loading" }
    : state;
}
