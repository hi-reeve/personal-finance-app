import type { CurrencyCode, SpendingByCategory } from "@pfa/core";
import { formatPercent } from "../app/percent";
import { Amount } from "../components/amount";
import { useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";

const SLICES = 5;
/** Each slice is a lighter tint, and is also numbered, so no slice depends on its colour. */
const TINTS = [1, 0.8, 0.62, 0.46, 0.32, 0.2];

interface Slice {
  key: string;
  name: string;
  total: number;
  share: number;
}

/**
 * The biggest top-level Categories as a ring, the rest gathered as "Other". The legend carries each
 * slice's number, name, amount and share, and a table repeats them, so the ring is only a picture.
 */
export function DonutChart({
  spending,
  currency,
}: {
  spending: SpendingByCategory;
  currency: CurrencyCode;
}) {
  const { t, money, numberFormat } = useLocale();
  const text = useMoneyText();
  const all = spending.categories.filter((c) => c.total > 0);
  const named: Slice[] = all.slice(0, SLICES).map((c) => ({
    key: c.categoryId,
    name: c.name ?? t.top_missing(),
    total: c.total,
    share: c.share,
  }));
  const rest = all.slice(SLICES);
  const slices: Slice[] =
    rest.length > 0
      ? [
          ...named,
          {
            key: "other",
            name: t.donut_other(),
            total: rest.reduce((sum, c) => sum + c.total, 0),
            share: rest.reduce((sum, c) => sum + c.share, 0),
          },
        ]
      : named;
  const biggest = slices[0];
  let offset = 0;

  return (
    <section aria-labelledby="donut-heading" className="flex flex-col gap-3">
      <h2 id="donut-heading" className="font-medium">
        {t.overview_donut()}
      </h2>
      {biggest === undefined ? (
        <p className="text-ink-muted">{t.donut_none()}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <svg viewBox="0 0 42 42" className="size-36 shrink-0 text-expense" aria-hidden="true">
              <circle
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="7"
              />
              {slices.map((slice, index) => {
                const length = slice.share / 100;
                const circle = (
                  <circle
                    key={slice.key}
                    cx="21"
                    cy="21"
                    r="15.9155"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={TINTS[index] ?? 0.2}
                    strokeWidth="7"
                    strokeDasharray={`${Math.max(length - 0.4, 0)} ${100 - Math.max(length - 0.4, 0)}`}
                    strokeDashoffset={25 - offset}
                    pathLength={100}
                  />
                );
                offset += length;
                return circle;
              })}
            </svg>
            <ol className="flex min-w-0 flex-1 flex-col gap-1.5">
              {slices.map((slice, index) => (
                <li key={slice.key} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full bg-expense"
                      style={{ opacity: TINTS[index] ?? 0.2 }}
                    />
                    <span className="truncate">
                      {index + 1}. {slice.name}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <Amount
                      direction="neutral"
                      variant="list"
                      formatted={money(slice.total, currency)}
                    />
                    <span className="text-ink-muted">
                      {formatPercent(slice.share, numberFormat)}%
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-sm text-ink-muted">
            {t.donut_summary({
              count: slices.length,
              name: biggest.name,
              share: formatPercent(biggest.share, numberFormat),
              amount: text(money(biggest.total, currency)),
            })}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2">{t.chart_show_table()}</summary>
            <table className="w-full text-sm">
              <caption className="sr-only">{t.overview_donut()}</caption>
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
                {slices.map((slice) => (
                  <tr key={slice.key} className="border-t border-line">
                    <th scope="row" className="py-1 text-start font-normal">
                      {slice.name}
                    </th>
                    <td className="py-1 text-end">
                      <Amount
                        direction="neutral"
                        variant="list"
                        formatted={money(slice.total, currency)}
                      />
                    </td>
                    <td className="py-1 text-end">{formatPercent(slice.share, numberFormat)}%</td>
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
