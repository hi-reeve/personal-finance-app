import type { BudgetProgress, Period } from "@pfa/core";
import { useEffect, useState } from "react";
import type { ReadyState } from "../app/app-provider";

export type BudgetsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; period: Period; progress: BudgetProgress[] };

/** How every budget stands over a month, asked again whenever the month or the data changes. */
export function useBudgetProgress(app: ReadyState, period: Period): BudgetsState {
  const [state, setState] = useState<BudgetsState>({ status: "loading" });
  const { read, version } = app;

  useEffect(() => {
    let live = true;
    read((engine) => engine.budgetProgress(period)).then(
      (progress) => live && setState({ status: "ready", period, progress }),
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
  }, [read, version, period.from, period.to]);

  // Figures for another month are never shown under this month's name.
  return state.status === "ready" && state.period.from !== period.from
    ? { status: "loading" }
    : state;
}
