import type { BudgetProgress, BudgetState, CurrencyCode } from "@pfa/core";
import { Amount } from "../components/amount";
import { useMoneyText } from "../components/hide-amounts";
import { useCategoryLabel } from "../components/category-label";
import { useLocale } from "../components/locale";
import type { ReadyState } from "../app/app-provider";
import { BUTTON } from "../components/styles";

/** Each state is told three ways: a colour, an icon and words, so none rests on colour alone. */
const LOOK: Record<BudgetState, { icon: string; bar: string; text: string }> = {
  "on-track": { icon: "✓", bar: "bg-success", text: "text-success" },
  near: { icon: "!", bar: "bg-warning", text: "text-warning" },
  over: { icon: "✕", bar: "bg-danger", text: "" },
};

export function BudgetCard({
  app,
  budget,
  currency,
  onChange,
  onRemove,
}: {
  app: ReadyState;
  budget: BudgetProgress;
  currency: CurrencyCode;
  onChange: () => void;
  onRemove: () => void;
}) {
  const { t, money } = useLocale();
  const text = useMoneyText();
  const label = useCategoryLabel(app.categories);
  const name = label(budget.categoryId);
  const look = LOOK[budget.state];
  const stateText = {
    "on-track": t.budget_state_on_track(),
    near: t.budget_state_near(),
    over: t.budget_state_over(),
  }[budget.state];
  const percent = Math.round(budget.used / 100);
  const left =
    budget.remaining >= 0
      ? t.budget_left({ amount: money(budget.remaining, currency) })
      : t.budget_over_by({ amount: money(-budget.remaining, currency) });

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate font-medium">{name}</h3>
        <span
          className={
            budget.state === "over"
              ? "rounded-md bg-danger px-2 py-0.5 text-sm text-on-danger"
              : `text-sm font-medium ${look.text}`
          }
        >
          <span aria-hidden="true">{look.icon} </span>
          {stateText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuetext={t.budget_used_text({ state: stateText, percent })}
        className="h-2 rounded-full bg-line"
      >
        <div
          className={`h-2 rounded-full ${look.bar}`}
          style={{ width: `${Math.min(Math.max(budget.used / 100, 1), 100)}%` }}
        />
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
        <span className="flex items-baseline gap-1">
          <Amount direction="neutral" variant="list" formatted={money(budget.spent, currency)} />
          <span aria-hidden="true">/</span>
          <Amount direction="neutral" variant="list" formatted={money(budget.amount, currency)} />
        </span>
        <span>
          {percent}% · {text(left)}
        </span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={BUTTON}
          aria-label={t.budgets_edit({ name })}
          onClick={onChange}
        >
          {t.budgets_change()}
        </button>
        <button
          type="button"
          className={BUTTON}
          aria-label={t.budgets_remove({ name })}
          onClick={onRemove}
        >
          {t.budgets_remove_button()}
        </button>
      </div>
    </li>
  );
}
