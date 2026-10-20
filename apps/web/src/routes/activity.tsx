import type { Transaction, Transfer } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useApp, type ReadyState } from "../app/app-provider";
import { Amount } from "../components/amount";
import { useCategoryLabel } from "../components/category-label";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { BUTTON } from "../components/styles";
import { TransactionDialog, isEditable } from "../components/transaction-dialog";

export const Route = createFileRoute("/activity")({ component: Activity });

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
  const [editingTransfer, setEditingTransfer] = useState<Transfer | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [asking, setAsking] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const accounts = new Map(app.accounts.map((a) => [a.id, a]));
  const currencyOf = (tx: Transaction) =>
    accounts.get(tx.accountId)?.currency ?? app.settings.baseCurrency ?? "USD";

  // A Transfer's fee shows inside its Transfer, not as a Transaction of its own.
  const entries = [
    ...app.activity
      .filter((tx) => tx.transferId === undefined)
      .map((tx) => ({
        kind: "transaction" as const,
        tx,
        date: tx.date,
        createdAt: tx.createdAt,
        id: tx.id,
      })),
    ...app.transfers.map((transfer) => ({
      kind: "transfer" as const,
      transfer,
      date: transfer.date,
      createdAt: transfer.createdAt,
      id: transfer.id,
    })),
  ].sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? 1
        : -1
      : b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1),
  );

  async function remove(id: string, kind: "transaction" | "transfer") {
    setProblem(undefined);
    try {
      await app.act((engine) =>
        kind === "transfer" ? engine.deleteTransfer(id) : engine.deleteTransaction(id),
      );
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
      {entries.length === 0 ? (
        <p className="text-ink-muted">{t.activity_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            if (entry.kind === "transfer")
              return (
                <TransferRow
                  key={entry.transfer.id}
                  transfer={entry.transfer}
                  app={app}
                  label={label}
                  asking={asking === entry.transfer.id}
                  onAsk={setAsking}
                  onEdit={() => {
                    setEditingTransfer(entry.transfer);
                    setEditing(undefined);
                    setEditOpen(true);
                  }}
                  onDelete={() => remove(entry.transfer.id, "transfer")}
                />
              );
            const tx = entry.tx;
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
                    <button
                      type="button"
                      className={BUTTON}
                      onClick={() => remove(tx.id, "transaction")}
                    >
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
                          setEditingTransfer(undefined);
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
        {...(editingTransfer ? { transfer: editingTransfer } : {})}
      />
    </Page>
  );
}

function TransferRow({
  transfer,
  app,
  label,
  asking,
  onAsk,
  onEdit,
  onDelete,
}: {
  transfer: Transfer;
  app: ReadyState;
  label: (categoryId: string) => string;
  asking: boolean;
  onAsk: (id: string | undefined) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, money, date } = useLocale();
  const from = app.accounts.find((a) => a.id === transfer.fromAccountId);
  const to = app.accounts.find((a) => a.id === transfer.toAccountId);
  const fromName = from?.name ?? t.activity_account_missing();
  const toName = to?.name ?? t.activity_account_missing();
  const title = t.activity_transfer_title({ from: fromName, to: toName });
  const base = app.settings.baseCurrency ?? "USD";
  const sent = money(transfer.fromAmount, from?.currency ?? base);
  const received = money(transfer.toAmount, to?.currency ?? base);
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-sm text-ink-muted">{date(transfer.date)}</span>
          {transfer.fee !== undefined && (
            <span className="block truncate text-sm text-ink-muted">
              {t.activity_transfer_fee({
                amount: money(transfer.fee.amount, from?.currency ?? base),
                category: label(transfer.fee.categoryId),
              })}
            </span>
          )}
          {transfer.note !== undefined && (
            <span className="block truncate text-sm text-ink-muted">{transfer.note}</span>
          )}
        </span>
        <Amount
          direction="neutral"
          variant="list"
          formatted={sent === received ? sent : t.activity_transfer_amounts({ sent, received })}
        />
      </div>
      {asking ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span>{t.activity_delete_ask()}</span>
          <button type="button" className={BUTTON} onClick={onDelete}>
            {t.activity_delete_yes()}
          </button>
          <button type="button" className={BUTTON} autoFocus onClick={() => onAsk(undefined)}>
            {t.activity_cancel()}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            aria-label={t.activity_transfer_edit({ label: title })}
            onClick={onEdit}
          >
            {t.activity_edit_button()}
          </button>
          <button
            type="button"
            className={BUTTON}
            aria-label={t.activity_transfer_delete({ label: title })}
            onClick={() => onAsk(transfer.id)}
          >
            {t.activity_delete_button()}
          </button>
        </div>
      )}
    </li>
  );
}
