import type { SubscriptionSummary } from "@pfa/core";
import { useEffect, useState } from "react";
import type { ReadyState } from "../app/app-provider";

/** The subscriptions as of today with their monthly total, asked again when the data changes. */
export function useSubscriptions(app: ReadyState, today: string): SubscriptionSummary | undefined {
  const [summary, setSummary] = useState<SubscriptionSummary | undefined>(undefined);
  const { read, version } = app;
  useEffect(() => {
    let live = true;
    read((engine) => engine.listSubscriptions(today)).then(
      (found) => live && setSummary(found),
      () => live && setSummary(undefined),
    );
    return () => {
      live = false;
    };
  }, [read, version, today]);
  return summary;
}
