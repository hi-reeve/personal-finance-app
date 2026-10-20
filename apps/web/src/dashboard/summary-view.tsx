import { Amount } from "../components/amount";
import { useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";
import { CategoryBars } from "./category-bars";
import { DailyChart } from "./daily-chart";
import type { SummaryData } from "./use-summary";

/** The headline: what was spent, and how that compares with the month before. */
function Hero({ data }: { data: SummaryData }) {
  const { t, money, month } = useLocale();
  const text = useMoneyText();
  const spent = data.spending.total;
  const before = data.previousSpending;
  const period = month(data.period.from);
  const previous = month(data.previous.from);
  if (spent <= 0 && data.spending.categories.length === 0)
    return <p className="text-lg font-medium">{t.hero_none({ period })}</p>;
  const percent = before > 0 ? Math.round((Math.abs(spent - before) / before) * 100) : undefined;
  return (
    <p className="text-lg font-medium">
      {t.hero_spent({ period, amount: text(money(spent, data.currency)) })}{" "}
      {percent === undefined
        ? ""
        : spent < before
          ? t.hero_less({ percent, previous })
          : spent > before
            ? t.hero_more({ percent, previous })
            : t.hero_same({ previous })}
    </p>
  );
}

function Cards({ data }: { data: SummaryData }) {
  const { t, money } = useLocale();
  const net = data.income - data.spending.total;
  const card = "flex flex-col gap-1 rounded-xl border border-line bg-surface p-4";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className={card}>
        <span className="text-sm text-ink-muted">{t.card_income()}</span>
        <Amount direction="income" variant="total" formatted={money(data.income, data.currency)} />
      </div>
      <div className={card}>
        <span className="text-sm text-ink-muted">{t.card_spending()}</span>
        <Amount
          direction="expense"
          variant="total"
          formatted={money(data.spending.total, data.currency)}
        />
      </div>
      <div className={card}>
        <span className="text-sm text-ink-muted">{t.card_net()}</span>
        <Amount
          direction={net > 0 ? "income" : net < 0 ? "expense" : "neutral"}
          variant="total"
          formatted={money(Math.abs(net), data.currency)}
        />
      </div>
    </div>
  );
}

/** The Home Summary view. Every figure comes from the report engine, so views never disagree. */
export function SummaryView({ data }: { data: SummaryData }) {
  const { t } = useLocale();
  const skipped = data.spending.skipped.lines;
  return (
    <div className="flex flex-col gap-6">
      <Hero data={data} />
      <Cards data={data} />
      <DailyChart daily={data.daily} currency={data.currency} />
      <CategoryBars spending={data.spending} currency={data.currency} />
      {skipped > 0 && (
        <p className="text-sm text-ink-muted">{t.skipped_note({ count: skipped })}</p>
      )}
    </div>
  );
}
