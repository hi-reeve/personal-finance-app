import type { Occurrence } from "@pfa/core";
import { useEffect, useState } from "react";
import type { ReadyState } from "../app/app-provider";

export type OccurrencesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; open: Occurrence[]; recent: Occurrence[] };

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * What needs action (overdue first, then the next 30 days) and what was settled lately. Asked
 * again whenever the data or the day changes.
 */
export function useOccurrences(app: ReadyState, today: string): OccurrencesState {
  const [state, setState] = useState<OccurrencesState>({ status: "loading" });
  const { read, version } = app;
  useEffect(() => {
    let live = true;
    read(async (engine) => {
      const open = await engine.listOccurrences({ to: addDays(today, 30), today });
      const history = await engine.listOccurrences({
        from: addDays(today, -60),
        to: today,
        today,
      });
      return {
        open,
        recent: history.filter((o) => o.status === "paid" || o.status === "skipped").reverse(),
      };
    }).then(
      ({ open, recent }) => live && setState({ status: "ready", open, recent }),
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
  }, [read, version, today]);
  return state;
}
