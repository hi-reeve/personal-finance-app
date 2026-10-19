import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp, type AccountView, type ReadyState } from "../app/app-provider";
import { AccountGlyph } from "../components/account-icon";
import { AccountForm, AdjustForm } from "../components/account-forms";
import { Amount } from "../components/amount";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";

export const Route = createFileRoute("/accounts")({ component: Accounts });

const BUTTON =
  "min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Editing = { id: string; mode: "edit" | "adjust" } | "new" | undefined;

function Accounts() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <AccountList app={app} /> : <Page title={t.nav_accounts()} />;
}

function AccountList({ app }: { app: ReadyState }) {
  const { t, money } = useLocale();
  const [editing, setEditing] = useState<Editing>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const active = app.accounts.filter((a) => a.archivedAt === undefined);
  const archived = app.accounts.filter((a) => a.archivedAt !== undefined);
  const done = () => setEditing(undefined);

  async function run(change: Parameters<typeof app.act>[0]) {
    setProblem(undefined);
    try {
      await app.act(change);
    } catch (error) {
      setProblem(
        t.accounts_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  function row(account: AccountView) {
    const mode =
      typeof editing === "object" && editing.id === account.id ? editing.mode : undefined;
    const isDefault = app.settings.defaultAccountId === account.id;
    return (
      <li key={account.id} className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <AccountGlyph
            {...(account.icon ? { icon: account.icon } : {})}
            {...(account.color ? { color: account.color } : {})}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{account.name}</span>
            <span className="text-sm text-ink-muted">
              {t[`kind_${account.kind}`]()}
              {isDefault && ` · ${t.accounts_default_badge()}`}
              {account.isLiability && ` · ${t.accounts_liability_badge()}`}
            </span>
          </span>
          <Amount
            direction="neutral"
            variant="list"
            formatted={money(account.balance, account.currency)}
          />
        </div>
        {mode === "edit" && (
          <AccountForm
            account={account}
            isDefault={isDefault}
            onCancel={done}
            onSave={async (patch, makeDefault) => {
              await run(async (engine) => {
                await engine.editAccount(account.id, patch);
                if (makeDefault !== isDefault)
                  await engine.setDefaultAccount(makeDefault ? account.id : undefined);
              });
              done();
            }}
          />
        )}
        {mode === "adjust" && (
          <AdjustForm
            account={account}
            onCancel={done}
            onApply={async (target, date) => {
              await run((engine) => engine.adjustBalance(account.id, { target, date }));
              done();
            }}
          />
        )}
        {mode === undefined && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={BUTTON}
              aria-label={t.accounts_edit({ name: account.name })}
              onClick={() => setEditing({ id: account.id, mode: "edit" })}
            >
              {t.accounts_change()}
            </button>
            <button
              type="button"
              className={BUTTON}
              onClick={() => setEditing({ id: account.id, mode: "adjust" })}
            >
              {t.accounts_adjust()}
            </button>
            {account.hasHistory ? (
              <button
                type="button"
                className={BUTTON}
                title={t.accounts_archive_hint()}
                onClick={() => run((engine) => engine.archiveAccount(account.id))}
              >
                {t.accounts_archive()}
              </button>
            ) : (
              <button
                type="button"
                className={BUTTON}
                onClick={() => run((engine) => engine.deleteAccount(account.id))}
              >
                {t.accounts_delete()}
              </button>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <Page title={t.nav_accounts()}>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {active.length === 0 ? (
        <p className="text-ink-muted">{t.accounts_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">{active.map(row)}</ul>
      )}

      {editing === "new" ? (
        <AccountForm
          onCancel={done}
          onSave={async (patch) => {
            await run((engine) =>
              engine.createAccount({
                name: patch.name ?? "",
                kind: patch.kind ?? "cash",
                currency: patch.currency ?? app.settings.baseCurrency ?? "USD",
                openingBalance: patch.openingBalance ?? 0,
                ...(patch.icon ? { icon: patch.icon } : {}),
                ...(patch.color ? { color: patch.color } : {}),
                ...(patch.isLiability !== undefined ? { isLiability: patch.isLiability } : {}),
              }),
            );
            done();
          }}
        />
      ) : (
        <button type="button" className={BUTTON} onClick={() => setEditing("new")}>
          {t.accounts_add()}
        </button>
      )}

      {archived.length > 0 && (
        <section aria-labelledby="archived-heading" className="flex flex-col gap-2">
          <h2 id="archived-heading" className="font-medium">
            {t.accounts_archived()}
          </h2>
          <ul className="flex flex-col gap-2">
            {archived.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-3 rounded-xl border border-line p-4 text-ink-muted"
              >
                <span className="min-w-0 flex-1 truncate">{account.name}</span>
                <Amount
                  direction="neutral"
                  variant="list"
                  formatted={money(account.balance, account.currency)}
                />
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => run((engine) => engine.unarchiveAccount(account.id))}
                >
                  {t.accounts_restore()}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
