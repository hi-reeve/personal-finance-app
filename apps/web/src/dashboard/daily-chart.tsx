import type { CurrencyCode, DailyTotals } from "@pfa/core";
import { useLocale } from "../components/locale";
import { useMoneyText } from "../components/hide-amounts";
import { Amount } from "../components/amount";

const WIDTH = 320;
const HEIGHT = 110;
const BASELINE = 96;
const TOP = 6;

/**
 * Spending by day as columns. The chart is a picture of numbers that are also written out: a
 * sentence summarises it and a table lists every day, so nothing depends on colour or sight, and
 * hidden amounts stay hidden everywhere.
 */
export function DailyChart({ daily, currency }: { daily: DailyTotals; currency: CurrencyCode }) {
  const { t, money, day } = useLocale();
  const text = useMoneyText();
  const days = daily.days;
  const peak = days.reduce((best, d) => (d.total > best.total ? d : best), days[0]!);
  const top = Math.max(peak?.total ?? 0, 0);
  const spendingDays = days.filter((d) => d.total > 0).length;
  const step = days.length > 0 ? WIDTH / days.length : WIDTH;

  const summary =
    top > 0
      ? t.daily_summary({
          total: text(money(daily.total, currency)),
          days: days.length,
          peak_day: day(peak!.date),
          peak: text(money(peak!.total, currency)),
        })
      : t.daily_summary_none();

  return (
    <section aria-labelledby="daily-heading" className="flex flex-col gap-3">
      <h2 id="daily-heading" className="font-medium">
        {t.daily_heading()}
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
        {days.map((d, index) => {
          const height = top > 0 ? (Math.max(d.total, 0) / top) * (BASELINE - TOP) : 0;
          return (
            <rect
              key={d.date}
              x={index * step + step * 0.15}
              y={BASELINE - height}
              width={step * 0.7}
              height={height}
              className="fill-expense"
              rx="1"
            />
          );
        })}
        {days.length > 0 &&
          [0, Math.floor((days.length - 1) / 2), days.length - 1].map((index, i) => (
            <text
              key={index}
              x={i === 0 ? 0 : i === 1 ? WIDTH / 2 : WIDTH}
              y={HEIGHT - 2}
              textAnchor={i === 0 ? "start" : i === 1 ? "middle" : "end"}
              fontSize="8"
              fill="currentColor"
            >
              {day(days[index]!.date)}
            </text>
          ))}
      </svg>
      <p className="text-sm text-ink-muted">{summary}</p>
      {spendingDays > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-2">{t.chart_show_table()}</summary>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <caption className="pb-1 text-start text-ink-muted">{t.chart_days_note()}</caption>
              <thead>
                <tr className="text-start">
                  <th scope="col" className="py-1 text-start">
                    {t.chart_day()}
                  </th>
                  <th scope="col" className="py-1 text-end">
                    {t.chart_amount()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {days
                  .filter((d) => d.total !== 0)
                  .map((d) => (
                    <tr key={d.date} className="border-t border-line">
                      <th scope="row" className="py-1 text-start font-normal">
                        {day(d.date)}
                      </th>
                      <td className="py-1 text-end">
                        <Amount
                          direction="neutral"
                          variant="list"
                          formatted={money(d.total, currency)}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
