import type { CurrencyCode, SpendingByCategory } from "@pfa/core";
import { formatPercent } from "../app/percent";
import { Amount } from "../components/amount";
import { useHideAmounts, useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";

const TOP = 5;

/**
 * The biggest top-level Categories as ranked bars. Every bar carries its name, amount and share
 * in words, and a table lists them all, so the ranking never rests on bar length or colour alone.
 */
export function CategoryBars({
  spending,
  currency,
}: {
  spending: SpendingByCategory;
  currency: CurrencyCode;
}) {
  const { t, money, numberFormat } = useLocale();
  const text = useMoneyText();
  const { hidden } = useHideAmounts();
  const all = spending.categories.filter((c) => c.total > 0);
  const shown = all.slice(0, TOP);
  const name = (c: (typeof all)[number]) => c.name ?? t.top_missing();
  const biggest = all[0];

  return (
    <section aria-labelledby="top-heading" className="flex flex-col gap-3">
      <h2 id="top-heading" className="font-medium">
        {t.top_heading()}
      </h2>
      {biggest === undefined ? (
        <p className="text-ink-muted">{t.top_none()}</p>
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {shown.map((c) => (
              <li key={c.categoryId} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">{name(c)}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <Amount
                      direction="neutral"
                      variant="list"
                      formatted={money(c.total, currency)}
                    />
                    <span className="text-sm text-ink-muted">
                      {formatPercent(c.share, numberFormat)}%
                    </span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-line" aria-hidden="true">
                  <div
                    className="h-2 rounded-full bg-expense"
                    // Bars are all the same length while amounts are hidden, so length reveals nothing.
                    style={{ width: `${hidden ? 50 : Math.max(c.share / 100, 1)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
          <p className="text-sm text-ink-muted">
            {t.top_summary({
              count: all.length,
              name: name(biggest),
              share: formatPercent(biggest.share, numberFormat),
              amount: text(money(biggest.total, currency)),
            })}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2">{t.chart_show_table()}</summary>
            <table className="w-full text-sm">
              <caption className="sr-only">{t.top_heading()}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 text-start">
                    {t.chart_category()}
                  </th>
                  <th scope="col" className="py-1 text-end">
                    {t.chart_amount()}
                  </th>
                  <th scope="col" className="py-1 text-end">
                    {t.chart_share()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {all.map((c) => (
                  <tr key={c.categoryId} className="border-t border-line">
                    <th scope="row" className="py-1 text-start font-normal">
                      {name(c)}
                    </th>
                    <td className="py-1 text-end">
                      <Amount
                        direction="neutral"
                        variant="list"
                        formatted={money(c.total, currency)}
                      />
                    </td>
                    <td className="py-1 text-end">{formatPercent(c.share, numberFormat)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
