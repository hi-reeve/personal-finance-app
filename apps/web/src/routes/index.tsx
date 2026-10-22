import { monthOf, type Period } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { today } from "../app/today";
import { useApp, type ReadyState } from "../app/app-provider";
import { HideAmountsToggle } from "../components/hide-amounts";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { CategoryTree } from "../dashboard/category-tree";
import { OverviewView } from "../dashboard/overview-view";
import {
  DisplayCurrencyView,
  RateEffectNote,
  RateModeSwitch,
  type RateMode,
} from "../dashboard/rate-controls";
import { useTodaysRates } from "../dashboard/use-rates";
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
  const now = today();
  const base = app.settings.baseCurrency;
  const foreign = [...new Set(app.accounts.map((a) => a.currency))].filter((c) => c !== base);
  const [mode, setMode] = useState<RateMode>("recorded");
  const rates = useTodaysRates(mode === "today" ? foreign : [], base, now);
  const todayRates = mode === "today" && rates.status === "ready" ? rates.rates : undefined;
  const summary = useSummary(app, period, todayRates);
  const waiting = mode === "today" && rates.status === "loading";
  const [view, setView] = useHomeView();
  return (
    <Page title={t.app_name()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodSelector period={period} onChange={setPeriod} />
        <HideAmountsToggle />
      </div>
      {foreign.length > 0 && <RateModeSwitch value={mode} onChange={setMode} />}
      <ViewSwitcher value={view} onChange={setView} />
      {waiting ? (
        <p className="text-ink-muted">{t.rates_looking_up()}</p>
      ) : summary.status === "ready" ? (
        <>
          <RateEffectNote data={summary.data} />
          <DisplayCurrencyView data={summary.data} today={now} />
          <Hero data={summary.data} />
          {view === "summary" ? (
            <SummaryView data={summary.data} />
          ) : view === "overview" ? (
            <OverviewView data={summary.data} app={app} />
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
