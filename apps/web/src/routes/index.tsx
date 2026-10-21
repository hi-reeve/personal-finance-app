import { monthOf, type Period } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { today } from "../app/today";
import { useApp, type ReadyState } from "../app/app-provider";
import { HideAmountsToggle } from "../components/hide-amounts";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { CategoryTree } from "../dashboard/category-tree";
import { Hero, SkippedNote } from "../dashboard/summary-view";
import { ViewSwitcher, useHomeView } from "../dashboard/view-switcher";
import { PeriodSelector } from "../dashboard/period-selector";
import { SummaryView } from "../dashboard/summary-view";
import { useSummary } from "../dashboard/use-summary";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <Dashboard app={app} /> : <Page title={t.app_name()} />;
}

function Dashboard({ app }: { app: ReadyState }) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<Period>(() => monthOf(today()));
  const summary = useSummary(app, period);
  const [view, setView] = useHomeView();
  return (
    <Page title={t.app_name()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector period={period} onChange={setPeriod} />
        <HideAmountsToggle />
      </div>
      <ViewSwitcher value={view} onChange={setView} />
      {summary.status === "ready" ? (
        <>
          <Hero data={summary.data} />
          {view === "summary" ? (
            <SummaryView data={summary.data} />
          ) : (
            <CategoryTree
              key={summary.data.period.from}
              spending={summary.data.spending}
              currency={summary.data.currency}
            />
          )}
          <SkippedNote data={summary.data} />
        </>
      ) : summary.status === "error" ? (
        <p role="alert" className="text-danger">
          {summary.message}
        </p>
      ) : (
        <p className="text-ink-muted">{t.home_loading()}</p>
      )}
    </Page>
  );
}
