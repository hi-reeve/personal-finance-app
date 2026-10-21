import { BALANCE_ADJUSTMENT_CATEGORY, type Category, type Transaction } from "@pfa/core";
import { Link } from "@tanstack/react-router";
import type { ReadyState } from "../app/app-provider";
import { Amount } from "../components/amount";
import { useCategoryLabel } from "../components/category-label";
import { useLocale } from "../components/locale";
import { FOCUS } from "../components/styles";

const COUNT = 5;

/** The latest Transactions, newest first. A Transfer's fee shows inside its Transfer, not here. */
export function RecentList({ app }: { app: ReadyState }) {
  const { t, money, date } = useLocale();
  const label = useCategoryLabel(app.categories as readonly Category[]);
  // Not a Transfer's fee (it shows inside its Transfer) and not a balance adjustment: neither is
  // spending or income, and reports leave them out.
  const recent = app.activity
    .filter(
      (tx) =>
        tx.transferId === undefined &&
        tx.lines.every((line) => line.categoryId !== BALANCE_ADJUSTMENT_CATEGORY),
    )
    .slice(0, COUNT);
  const currencyOf = (tx: Transaction) =>
    app.accounts.find((a) => a.id === tx.accountId)?.currency ?? app.settings.baseCurrency ?? "USD";

  return (
    <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
      <h2 id="recent-heading" className="font-medium">
        {t.recent_heading()}
      </h2>
      {recent.length === 0 ? (
        <p className="text-ink-muted">{t.recent_none()}</p>
      ) : (
        <ul className="flex flex-col">
          {recent.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0"
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {tx.payee ?? label(tx.lines[0]?.categoryId ?? "")}
                </span>
                <span className="block truncate text-sm text-ink-muted">{date(tx.date)}</span>
              </span>
              <Amount
                direction={tx.total > 0 ? "income" : "expense"}
                variant="list"
                formatted={money(Math.abs(tx.total), currencyOf(tx))}
              />
            </li>
          ))}
        </ul>
      )}
      <Link to="/activity" className={`self-start underline ${FOCUS}`}>
        {t.recent_all()}
      </Link>
    </section>
  );
}
