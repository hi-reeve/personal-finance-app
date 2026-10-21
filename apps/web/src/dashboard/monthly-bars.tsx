import type { CurrencyCode, MonthlyTotals } from "@pfa/core";
import { Amount } from "../components/amount";
import { useHideAmounts, useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";

const WIDTH = 320;
const HEIGHT = 120;
const BASELINE = 104;
const TOP = 6;

/**
 * Income and spending for each month as pairs of columns: income on the left, spending on the
 * right, so the two are told apart by place as well as colour. A sentence and a table repeat it.
 */
export function MonthlyBars({
  monthly,
  currency,
}: {
  monthly: MonthlyTotals;
  currency: CurrencyCode;
}) {
  const { t, money, monthShort, month } = useLocale();
  const text = useMoneyText();
  const { hidden } = useHideAmounts();
  const months = monthly.months;
  const biggest = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const income = months.reduce((sum, m) => sum + m.income, 0);
  const spent = months.reduce((sum, m) => sum + m.expense, 0);
  const worst = months.reduce<(typeof months)[number] | undefined>(
    (best, m) => (best === undefined || m.expense > best.expense ? m : best),
    undefined,
  );
  const summary =
    worst !== undefined && (income > 0 || spent > 0)
      ? t.monthly_summary({
          months: months.length,
          income: text(money(income, currency)),
          spent: text(money(spent, currency)),
          month: month(worst.from),
          amount: text(money(worst.expense, currency)),
        })
      : t.monthly_summary_none();
  const slot = months.length > 0 ? WIDTH / months.length : WIDTH;
  const bar = (value: number) =>
    value > 0
      ? Math.max(hidden ? (BASELINE - TOP) / 2 : (value / biggest) * (BASELINE - TOP), 1)
      : 0;

  return (
    <section aria-labelledby="monthly-heading" className="flex flex-col gap-3">
      <h2 id="monthly-heading" className="font-medium">
        {t.monthly_heading()}
      </h2>
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full text-ink-muted"
      >
        <line
          x1="0"
          x2={WIDTH}
          y1={BASELINE}
          y2={BASELINE}
          stroke="currentColor"
          strokeWidth="0.5"
        />
        {months.map((m, index) => {
          const x = index * slot;
          const incomeHeight = bar(m.income);
          const spendHeight = bar(m.expense);
          return (
            <g key={m.month}>
              <rect
                x={x + slot * 0.12}
                y={BASELINE - incomeHeight}
                width={slot * 0.33}
                height={incomeHeight}
                className="fill-income"
                rx="1"
              />
              <rect
                x={x + slot * 0.5}
                y={BASELINE - spendHeight}
                width={slot * 0.33}
                height={spendHeight}
                className="fill-expense"
                rx="1"
              />
              <text
                x={x + slot / 2}
                y={HEIGHT - 4}
                textAnchor="middle"
                fontSize="8"
                fill="currentColor"
              >
                {monthShort(m.from)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="flex flex-wrap gap-x-4 text-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-income" />
          {t.monthly_income()}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-expense" />
          {t.monthly_spending()}
        </span>
      </p>
      <p className="text-sm text-ink-muted" aria-hidden="true">
        {summary}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-2">{t.chart_show_table()}</summary>
        <table className="w-full text-sm">
          <caption className="sr-only">{t.monthly_heading()}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 text-start">
                {t.chart_month()}
              </th>
              <th scope="col" className="py-1 text-end">
                {t.monthly_income()}
              </th>
              <th scope="col" className="py-1 text-end">
                {t.monthly_spending()}
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t border-line">
                <th scope="row" className="py-1 text-start font-normal">
                  {month(m.from)}
                </th>
                <td className="py-1 text-end">
                  <Amount
                    direction="neutral"
                    variant="list"
                    formatted={money(m.income, currency)}
                  />
                </td>
                <td className="py-1 text-end">
                  <Amount
                    direction="neutral"
                    variant="list"
                    formatted={money(m.expense, currency)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
