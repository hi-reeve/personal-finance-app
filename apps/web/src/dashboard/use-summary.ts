import {
  shiftMonth,
  type CurrencyCode,
  type DailyTotals,
  type Period,
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
}

export type SummaryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: SummaryData };

/**
 * Everything the Summary view shows, asked of the report engine for one month. Asks again when the
 * month changes or the data does, so a number on screen is never older than the data.
 */
export function useSummary(app: ReadyState, period: Period): SummaryState {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const { read, version } = app;
  const base = app.settings.baseCurrency;

  useEffect(() => {
    if (base === undefined) return;
    let live = true;
    const previous = shiftMonth(period, -1);
    read(async (engine) => {
      const [spending, daily, income, before] = await Promise.all([
        engine.spendingByCategory(period),
        engine.dailyTotals(period),
        engine.spendingByCategory({ ...period, kind: "income" }),
        engine.spendingByCategory(previous),
      ]);
      return {
        currency: base,
        period,
        previous,
        spending,
        daily,
        income: income.total,
        previousSpending: before.total,
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
  }, [read, version, base, period.from, period.to]);

  // Figures for another month are never shown under this month's name.
  return state.status === "ready" && state.data.period.from !== period.from
    ? { status: "loading" }
    : state;
}
