import { parseMoney, type CurrencyCode } from "@pfa/core";
import { useState, type FormEvent } from "react";
import type { ReadyState } from "../app/app-provider";
import { CategoryPicker } from "../components/category-picker";
import { useLocale } from "../components/locale";
import { BUTTON, FIELD, FOCUS } from "../components/styles";

/** Set a monthly limit on an expense Category, or change one. */
export function BudgetForm({
  app,
  currency,
  existing,
  onDone,
  onCancel,
}: {
  app: ReadyState;
  currency: CurrencyCode;
  /** Present when changing a budget: its Category is fixed and only the amount changes. */
  existing?: { categoryId: string; amount: number };
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t, money, numberFormat } = useLocale();
  const plain = (minor: number) => money(minor, currency).replace(/^[^\d-]+/, "");
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId);
  const [amount, setAmount] = useState(existing ? plain(existing.amount) : "");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (categoryId === undefined) return setProblem(t.budgets_no_category());
    const parsed = parseMoney(amount, currency, { numberFormat });
    if (parsed === undefined || parsed <= 0)
      return setProblem(t.budgets_invalid_amount({ example: plain(1_500_000) }));
    setProblem(undefined);
    setSaving(true);
    try {
      await app.act((engine) => engine.setBudget(categoryId, parsed));
      onDone();
    } catch (error) {
      setProblem(
        t.budgets_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
      setSaving(false);
    }
  }

  // New budgets go on expense Categories that have none yet.
  const taken = new Set(app.budgets.map((b) => b.categoryId));
  const choices = app.categories.filter((c) => c.kind === "expense" && !taken.has(c.id));

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
    >
      {existing === undefined && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">{t.budgets_category()}</legend>
          {choices.length === 0 ? (
            <p className="text-ink-muted">{t.budgets_no_categories()}</p>
          ) : (
            <CategoryPicker
              categories={choices}
              recent={[]}
              kind="expense"
              value={categoryId}
              onChange={setCategoryId}
            />
          )}
        </fieldset>
      )}
      <label className="flex flex-col gap-1">
        <span>{t.budgets_amount()}</span>
        <input
          className={FIELD}
          inputMode="decimal"
          autoFocus={existing !== undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className={`min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent disabled:opacity-60 ${FOCUS}`}
        >
          {t.budgets_save()}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          {t.budgets_cancel()}
        </button>
      </div>
    </form>
  );
}
