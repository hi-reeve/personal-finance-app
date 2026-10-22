import type { BudgetStanding } from "@pfa/core";
import { useEffect, useState } from "react";
import type { ReadyState } from "../app/app-provider";

export type BudgetsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; on: string; standing: BudgetStanding };

/** How every budget stands in the period around a day, asked again whenever the day or the data changes. */
export function useBudgetProgress(app: ReadyState, on: string): BudgetsState {
  const [state, setState] = useState<BudgetsState>({ status: "loading" });
  const { read, version } = app;

  useEffect(() => {
    let live = true;
    read((engine) => engine.budgetProgress(on)).then(
      (standing) => live && setState({ status: "ready", on, standing }),
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
  }, [read, version, on]);

  // Figures for another day are never shown under this day's name.
  return state.status === "ready" && state.on !== on ? { status: "loading" } : state;
}
