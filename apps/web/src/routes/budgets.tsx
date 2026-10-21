import { monthOf, type Period } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { today } from "../app/today";
import { useApp, type ReadyState } from "../app/app-provider";
import { BudgetCard } from "../budgets/budget-card";
import { BudgetForm } from "../budgets/budget-form";
import { useBudgetProgress } from "../budgets/use-budgets";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { BUTTON } from "../components/styles";
import { PeriodSelector } from "../dashboard/period-selector";

export const Route = createFileRoute("/budgets")({ component: Budgets });

function Budgets() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <BudgetList app={app} /> : <Page title={t.nav_budgets()} />;
}

function BudgetList({ app }: { app: ReadyState }) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<Period>(() => monthOf(today()));
  const [editing, setEditing] = useState<string | "new" | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const state = useBudgetProgress(app, period);
  const currency = app.settings.baseCurrency ?? "USD";
  const close = () => setEditing(undefined);

  async function remove(categoryId: string) {
    setProblem(undefined);
    try {
      await app.act((engine) => engine.removeBudget(categoryId));
    } catch (error) {
      setProblem(
        t.budgets_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  return (
    <Page title={t.nav_budgets()}>
      <PeriodSelector period={period} onChange={setPeriod} />
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
      {state.status === "ready" &&
        (state.progress.length === 0 && editing !== "new" ? (
          <p className="text-ink-muted">{t.budgets_empty()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {state.progress.map((budget) =>
              editing === budget.categoryId ? (
                <li key={budget.categoryId}>
                  <BudgetForm
                    app={app}
                    currency={currency}
                    existing={budget}
                    onDone={close}
                    onCancel={close}
                  />
                </li>
              ) : (
                <BudgetCard
                  key={budget.categoryId}
                  app={app}
                  budget={budget}
                  currency={currency}
                  onChange={() => setEditing(budget.categoryId)}
                  onRemove={() => remove(budget.categoryId)}
                />
              ),
            )}
          </ul>
        ))}
      {editing === "new" ? (
        <BudgetForm app={app} currency={currency} onDone={close} onCancel={close} />
      ) : (
        <button type="button" className={BUTTON} onClick={() => setEditing("new")}>
          {t.budgets_add()}
        </button>
      )}
    </Page>
  );
}
