import type { ActivityKind } from "@pfa/core";
import { useActivityFilter } from "../app/activity-filter-state";
import type { ReadyState } from "../app/app-provider";
import { CategoryPicker } from "./category-picker";
import { useLocale } from "./locale";
import { BUTTON, FIELD } from "./styles";

const KINDS: readonly (ActivityKind | "all")[] = ["all", "expense", "income", "transfer"];

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Search box and the filters that narrow Activity. State lives in the filter context. */
export function ActivityFilters({
  app,
  active,
  badAmount,
}: {
  app: ReadyState;
  /** How many filters are set, for the toggle label. */
  active: number;
  /** Which amount box holds something that is not an amount. */
  badAmount: { min: boolean; max: boolean; order: boolean };
}) {
  const { t, money } = useLocale();
  const { draft, update, clear } = useActivityFilter();
  const example = money(150_000, app.settings.baseCurrency ?? "USD").replace(/^[^\d-]+/, "");
  const kindLabel = (k: ActivityKind | "all") =>
    k === "all"
      ? t.filters_kind_all()
      : k === "expense"
        ? t.categories_expense()
        : k === "income"
          ? t.categories_income()
          : t.mode_transfer();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          className={FIELD}
          type="search"
          aria-label={t.filters_search()}
          placeholder={t.filters_search()}
          value={draft.text}
          onChange={(e) => update({ text: e.target.value })}
        />
        <button
          type="button"
          className={`${BUTTON} shrink-0`}
          aria-expanded={draft.open}
          onClick={() => update({ open: !draft.open })}
        >
          {active > 0 ? t.filters_toggle_count({ count: active }) : t.filters_toggle()}
        </button>
      </div>
      {draft.open && (
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span>{t.filters_from()}</span>
              <input
                className={FIELD}
                type="date"
                value={draft.from}
                onChange={(e) => update({ from: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t.filters_to()}</span>
              <input
                className={FIELD}
                type="date"
                value={draft.to}
                onChange={(e) => update({ to: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1">{t.filters_kind()}</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.kind === k}
                  onClick={() => update({ kind: k })}
                  className={`${BUTTON} aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent`}
                >
                  {kindLabel(k)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span>{t.filters_min()}</span>
              <input
                className={FIELD}
                inputMode="decimal"
                aria-invalid={badAmount.min}
                aria-describedby={badAmount.min || badAmount.max ? "amount-problem" : undefined}
                value={draft.min}
                onChange={(e) => update({ min: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t.filters_max()}</span>
              <input
                className={FIELD}
                inputMode="decimal"
                aria-invalid={badAmount.max}
                aria-describedby={badAmount.min || badAmount.max ? "amount-problem" : undefined}
                value={draft.max}
                onChange={(e) => update({ max: e.target.value })}
              />
            </label>
          </div>
          {(badAmount.min || badAmount.max || badAmount.order) && (
            <p id="amount-problem" role="alert" className="text-sm text-danger">
              {badAmount.order && !badAmount.min && !badAmount.max
                ? t.filters_min_over_max()
                : t.filters_bad_amount({ example })}
            </p>
          )}
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1">{t.filters_accounts()}</legend>
            {app.accounts.map((account) => (
              <label key={account.id} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.accountIds.includes(account.id)}
                  onChange={() => update({ accountIds: toggle(draft.accountIds, account.id) })}
                />
                <span>{account.name}</span>
              </label>
            ))}
          </fieldset>
          {app.tags.length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1">{t.filters_tags()}</legend>
              {app.tags.map((tag) => (
                <label key={tag.id} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.tagIds.includes(tag.id)}
                    onChange={() => update({ tagIds: toggle(draft.tagIds, tag.id) })}
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </fieldset>
          )}
          {app.categories.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1">{t.filters_category()}</legend>
              <CategoryPicker
                categories={app.categories}
                recent={app.recentCategories}
                value={draft.categoryId}
                onChange={(id) => update({ categoryId: id })}
                noneLabel={t.filters_any_category()}
              />
            </fieldset>
          )}
          <button type="button" className={`${BUTTON} self-start`} onClick={clear}>
            {t.filters_clear()}
          </button>
        </div>
      )}
    </section>
  );
}
