import {
  convertMinor,
  filterActivity,
  parseMoney,
  type ActivityEntry,
  type ActivityFilter,
  type Transaction,
  type Transfer,
} from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";
import { useActivityFilter } from "../app/activity-filter-state";
import { useApp, type ReadyState } from "../app/app-provider";
import { ActivityFilters } from "../components/activity-filters";
import { Amount } from "../components/amount";
import { useCategoryLabel } from "../components/category-label";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { BUTTON } from "../components/styles";
import { TransactionDialog, isEditable } from "../components/transaction-dialog";

export const Route = createFileRoute("/activity")({ component: Activity });

const PAGE = 50;

function Activity() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <List app={app} /> : <Page title={t.nav_activity()} />;
}

function List({ app }: { app: ReadyState }) {
  const { t, money, date, numberFormat } = useLocale();
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

  const baseCurrency = app.settings.baseCurrency;
  // What a foreign Transaction came to in the base currency, at its own frozen rate.
  const baseText = (tx: Transaction): string | undefined => {
    const currency = accounts.get(tx.accountId)?.currency;
    if (baseCurrency === undefined || currency === undefined || currency === baseCurrency)
      return undefined;
    if (tx.rate === undefined) return undefined;
    return t.activity_base({
      amount: money(
        Math.abs(convertMinor(tx.total, tx.rate, currency, baseCurrency)),
        baseCurrency,
      ),
    });
  };

  // A Transfer's fee shows inside its Transfer, not as a Transaction of its own.
  const everything = useMemo<ActivityEntry[]>(() => {
    const dateOf = (e: ActivityEntry) =>
      e.kind === "transfer" ? e.transfer.date : e.transaction.date;
    const createdOf = (e: ActivityEntry) =>
      e.kind === "transfer" ? e.transfer.createdAt : e.transaction.createdAt;
    const idOf = (e: ActivityEntry) => (e.kind === "transfer" ? e.transfer.id : e.transaction.id);
    return [
      ...app.activity
        .filter((tx) => tx.transferId === undefined)
        .map((transaction) => ({ kind: "transaction" as const, transaction })),
      ...app.transfers.map((transfer) => ({ kind: "transfer" as const, transfer })),
    ].sort((a, b) =>
      dateOf(a) !== dateOf(b)
        ? dateOf(a) < dateOf(b)
          ? 1
          : -1
        : createdOf(b) - createdOf(a) || (idOf(a) < idOf(b) ? 1 : -1),
    );
  }, [app.activity, app.transfers]);

  const { draft } = useActivityFilter();
  const base = app.settings.baseCurrency ?? "USD";
  const min = draft.min.trim() === "" ? undefined : parseMoney(draft.min, base, { numberFormat });
  const max = draft.max.trim() === "" ? undefined : parseMoney(draft.max, base, { numberFormat });
  const badAmount = {
    min: draft.min.trim() !== "" && min === undefined,
    max: draft.max.trim() !== "" && max === undefined,
    order: min !== undefined && max !== undefined && min > max,
  };
  // Typing stays responsive on a long list: the list catches up when the browser is idle.
  const text = useDeferredValue(draft.text);
  // Choices whose Account, Category or Tag has since gone are dropped, not left to empty the list.
  const accountIds = draft.accountIds.filter((id) => app.accounts.some((a) => a.id === id));
  const tagIds = draft.tagIds.filter((id) => app.tags.some((tag) => tag.id === id));
  const categoryId = app.categories.some((c) => c.id === draft.categoryId)
    ? draft.categoryId
    : undefined;
  const filter = useMemo<ActivityFilter>(
    () => ({
      ...(text.trim() !== "" ? { text } : {}),
      ...(draft.from !== "" ? { from: draft.from } : {}),
      ...(draft.to !== "" ? { to: draft.to } : {}),
      ...(accountIds.length > 0 ? { accountIds } : {}),
      ...(categoryId !== undefined ? { categoryIds: [categoryId] } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
      ...(draft.kind !== "all" ? { kind: draft.kind } : {}),
      ...(min !== undefined ? { minAmount: min } : {}),
      ...(max !== undefined ? { maxAmount: max } : {}),
    }),
    // The lists are rebuilt each render; their contents are what matters.
    [
      text,
      draft.from,
      draft.to,
      draft.kind,
      accountIds.join(),
      tagIds.join(),
      categoryId,
      min,
      max,
    ],
  );
  const entries = useMemo(
    () => filterActivity(everything, filter, { categories: app.categories }),
    [everything, filter, app.categories],
  );
  // Large lists render a page at a time. The count belongs to one filter, so a new filter starts
  // again at the first page with no extra render.
  const [paging, setPaging] = useState({ filter, count: PAGE });
  const shown = paging.filter === filter ? paging.count : PAGE;
  const active = Object.keys(filter).length;

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
      <ActivityFilters app={app} active={active} badAmount={badAmount} />
      <p className="min-h-5 text-sm text-ink-muted" aria-live="polite">
        {active > 0
          ? t.filters_results({ shown: Math.min(shown, entries.length), total: entries.length })
          : ""}
      </p>
      {entries.length === 0 ? (
        <p className="text-ink-muted">
          {everything.length === 0 ? t.activity_empty() : t.filters_none()}
        </p>
      ) : (
        <ul aria-label={t.nav_activity()} className="flex flex-col gap-2">
          {entries.slice(0, shown).map((entry) => {
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
            const tx = entry.transaction;
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
                    {tx.original !== undefined && (
                      <span className="block truncate text-sm text-ink-muted">
                        {t.activity_original({
                          amount: money(tx.original.amount, tx.original.currency),
                        })}
                      </span>
                    )}
                    {baseText(tx) !== undefined && (
                      <span className="block truncate text-sm text-ink-muted">{baseText(tx)}</span>
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
      {entries.length > shown && (
        <button
          type="button"
          className={BUTTON}
          onClick={() => setPaging({ filter, count: shown + PAGE })}
        >
          {t.filters_show_more()}
        </button>
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
