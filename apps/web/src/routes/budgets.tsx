import { monthOf, type CurrencyCode, type OverallBudgetProgress, type Period } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { today } from "../app/today";
import { useApp, type Change, type ReadyState } from "../app/app-provider";
import { BudgetCard } from "../budgets/budget-card";
import { BudgetForm } from "../budgets/budget-form";
import { useBudgetProgress } from "../budgets/use-budgets";
import { useCategoryLabel } from "../components/category-label";
import { useLocale } from "../components/locale";
import { useMoneyText } from "../components/hide-amounts";
import { Page } from "../components/page";
import { BUTTON } from "../components/styles";
import { PeriodSelector } from "../dashboard/period-selector";

export const Route = createFileRoute("/budgets")({ component: Budgets });

function Budgets() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <BudgetList app={app} /> : <Page title={t.nav_budgets()} />;
}

/** Said under the overall budget: how much of it the Category budgets leave unassigned. */
function Allocation({
  overall,
  currency,
}: {
  overall: OverallBudgetProgress;
  currency: CurrencyCode;
}) {
  const { t, money } = useLocale();
  const text = useMoneyText();
  return (
    <p className={`text-sm ${overall.unallocated < 0 ? "text-danger" : "text-ink-muted"}`}>
      {overall.unallocated < 0 && <span aria-hidden="true">! </span>}
      {text(
        overall.unallocated < 0
          ? t.budget_over_allocated({ amount: money(-overall.unallocated, currency) })
          : t.budget_unallocated({ amount: money(overall.unallocated, currency) }),
      )}
    </p>
  );
}

function BudgetList({ app }: { app: ReadyState }) {
  const { t } = useLocale();
  const [period, setPeriod] = useState<Period>(() => monthOf(today()));
  const [editing, setEditing] = useState<string | "new" | "overall" | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  // The day the budgets are read on: today for this month, else the end of the month shown.
  const now = today();
  const on = period.from <= now && now <= period.to ? now : period.to;
  const state = useBudgetProgress(app, on);
  const label = useCategoryLabel(app.categories);
  const currency = app.settings.baseCurrency ?? "USD";
  const close = () => setEditing(undefined);

  async function remove(removal: Change) {
    setProblem(undefined);
    try {
      await app.act(removal);
    } catch (error) {
      setProblem(
        t.budgets_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  const standing = state.status === "ready" ? state.standing : undefined;
  const nothing =
    standing !== undefined && standing.categories.length === 0 && standing.overall === undefined;

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
      {standing !== undefined && (
        <>
          {nothing && editing !== "new" && editing !== "overall" && (
            <p className="text-ink-muted">{t.budgets_empty()}</p>
          )}
          <ul className="flex flex-col gap-3">
            {standing.overall !== undefined &&
              (editing === "overall" ? (
                <li>
                  <BudgetForm
                    app={app}
                    currency={currency}
                    overall
                    existing={app.overallBudget ?? standing.overall}
                    onDone={close}
                    onCancel={close}
                  />
                </li>
              ) : (
                <BudgetCard
                  name={t.budgets_overall()}
                  budget={standing.overall}
                  currency={currency}
                  note={<Allocation overall={standing.overall} currency={currency} />}
                  onChange={() => setEditing("overall")}
                  onRemove={() => remove((engine) => engine.removeOverallBudget())}
                />
              ))}
            {standing.categories.map((budget) => {
              const name = label(budget.categoryId);
              return editing === budget.categoryId ? (
                <li key={budget.categoryId}>
                  <BudgetForm
                    app={app}
                    currency={currency}
                    existing={app.budgets.find((b) => b.categoryId === budget.categoryId) ?? budget}
                    onDone={close}
                    onCancel={close}
                  />
                </li>
              ) : (
                <BudgetCard
                  key={budget.categoryId}
                  name={name}
                  budget={budget}
                  currency={currency}
                  onChange={() => setEditing(budget.categoryId)}
                  onRemove={() => remove((engine) => engine.removeBudget(budget.categoryId))}
                />
              );
            })}
          </ul>
        </>
      )}
      {editing === "new" && (
        <BudgetForm app={app} currency={currency} onDone={close} onCancel={close} />
      )}
      {editing === "overall" && standing?.overall === undefined && (
        <BudgetForm app={app} currency={currency} overall onDone={close} onCancel={close} />
      )}
      {editing !== "new" && editing !== "overall" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON} onClick={() => setEditing("new")}>
            {t.budgets_add()}
          </button>
          {standing?.overall === undefined && (
            <button type="button" className={BUTTON} onClick={() => setEditing("overall")}>
              {t.budgets_overall_add()}
            </button>
          )}
        </div>
      )}
    </Page>
  );
}
