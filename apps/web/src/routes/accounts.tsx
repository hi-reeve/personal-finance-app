import { createFileRoute } from "@tanstack/react-router";
import { useApp } from "../app/app-provider";
import { Amount } from "../components/amount";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";

export const Route = createFileRoute("/accounts")({ component: Accounts });

function Accounts() {
  const { t, money } = useLocale();
  const app = useApp();
  const accounts = app.status === "ready" ? app.accounts : [];
  return (
    <Page title={t.nav_accounts()}>
      {accounts.length === 0 ? (
        <p className="text-ink-muted">{t.accounts_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between rounded-xl border border-line bg-surface p-4"
            >
              <span>
                <span className="block font-medium">{account.name}</span>
                <span className="text-sm text-ink-muted">{t[`kind_${account.kind}`]()}</span>
              </span>
              <Amount
                direction="neutral"
                variant="list"
                formatted={money(account.openingBalance, account.currency)}
              />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
