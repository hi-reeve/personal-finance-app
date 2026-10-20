import type { Transaction } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp, type ReadyState } from "../app/app-provider";
import { Amount } from "../components/amount";
import { useCategoryLabel } from "../components/category-label";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { TransactionDialog, isEditable } from "../components/transaction-dialog";

export const Route = createFileRoute("/activity")({ component: Activity });

const BUTTON =
  "min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Activity() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <List app={app} /> : <Page title={t.nav_activity()} />;
}

function List({ app }: { app: ReadyState }) {
  const { t, money, date } = useLocale();
  const label = useCategoryLabel(app.categories);
  // Kept after the dialog closes so its title does not change while it animates away.
  const [editing, setEditing] = useState<Transaction | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [asking, setAsking] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const accounts = new Map(app.accounts.map((a) => [a.id, a]));
  const currencyOf = (tx: Transaction) =>
    accounts.get(tx.accountId)?.currency ?? app.settings.baseCurrency ?? "USD";

  async function remove(id: string) {
    setProblem(undefined);
    try {
      await app.act((engine) => engine.deleteTransaction(id));
      setAsking(undefined);
    } catch (error) {
      setProblem(t.tx_failed({ message: error instanceof Error ? error.message : String(error) }));
    }
  }

  return (
    <Page title={t.nav_activity()}>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {app.activity.length === 0 ? (
        <p className="text-ink-muted">{t.activity_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {app.activity.map((tx) => {
            const account = accounts.get(tx.accountId);
            const category = label(tx.lines[0]?.categoryId ?? "");
            const title = tx.payee ?? category;
            const income = tx.total > 0;
            return (
              <li key={tx.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {[date(tx.date), account?.name, tx.payee !== undefined ? category : undefined]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {tx.lines.length > 1 && (
                      <ul className="mt-1 flex flex-col gap-0.5 text-sm text-ink-muted">
                        {tx.lines.map((line) => (
                          <li key={line.id} className="flex justify-between gap-3">
                            <span className="truncate">
                              {line.itemName !== undefined
                                ? `${line.itemName} · ${label(line.categoryId)}`
                                : label(line.categoryId)}
                            </span>
                            <Amount
                              direction="neutral"
                              variant="list"
                              formatted={money(Math.abs(line.amount), currencyOf(tx))}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    {tx.note !== undefined && (
                      <span className="block truncate text-sm text-ink-muted">{tx.note}</span>
                    )}
                  </span>
                  <Amount
                    direction={income ? "income" : "expense"}
                    variant="list"
                    formatted={money(
                      Math.abs(tx.total),
                      account?.currency ?? app.settings.baseCurrency ?? "USD",
                    )}
                  />
                </div>
                {asking === tx.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span>{t.activity_delete_ask()}</span>
                    <button type="button" className={BUTTON} onClick={() => remove(tx.id)}>
                      {t.activity_delete_yes()}
                    </button>
                    <button
                      type="button"
                      className={BUTTON}
                      autoFocus
                      onClick={() => setAsking(undefined)}
                    >
                      {t.activity_cancel()}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isEditable(tx) && (
                      <button
                        type="button"
                        className={BUTTON}
                        aria-label={t.activity_edit({ label: title })}
                        onClick={() => {
                          setEditing(tx);
                          setEditOpen(true);
                        }}
                      >
                        {t.activity_edit_button()}
                      </button>
                    )}
                    <button
                      type="button"
                      className={BUTTON}
                      aria-label={t.activity_delete({ label: title })}
                      onClick={() => setAsking(tx.id)}
                    >
                      {t.activity_delete_button()}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TransactionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        {...(editing ? { transaction: editing } : {})}
      />
    </Page>
  );
}
