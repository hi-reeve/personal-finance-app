import { BALANCE_ADJUSTMENT_CATEGORY, parseMoney, signedAmount, type Transaction } from "@pfa/core";
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useApp, type ReadyState } from "../app/app-provider";
import { today } from "../app/today";
import { CategoryPicker } from "./category-picker";
import { useLocale } from "./locale";

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A Transaction that can be edited as one amount and one Category. */
export function isSimple(transaction: Transaction): boolean {
  return (
    transaction.lines.length === 1 &&
    transaction.lines[0]!.categoryId !== BALANCE_ADJUSTMENT_CATEGORY
  );
}

function TransactionForm({
  app,
  transaction,
  onDone,
}: {
  app: ReadyState;
  transaction?: Transaction;
  onDone: () => void;
}) {
  const { t, money, numberFormat } = useLocale();
  const open = app.accounts.filter((a) => a.archivedAt === undefined);
  const line = transaction?.lines[0];
  // The chosen default, else the Account used last, else the first one.
  const lastUsed = app.activity.find((tx) => open.some((a) => a.id === tx.accountId))?.accountId;
  const chosen = open.find((a) => a.id === app.settings.defaultAccountId)?.id;
  const defaultAccount = chosen ?? lastUsed ?? open[0]?.id;
  const [accountId, setAccountId] = useState(transaction?.accountId ?? defaultAccount ?? "");
  const account = app.accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? app.settings.baseCurrency ?? "USD";
  const [amount, setAmount] = useState(
    transaction ? money(Math.abs(transaction.total), currency).replace(/^[^\d-]+/, "") : "",
  );
  const [date, setDate] = useState(transaction?.date ?? today());
  const [categoryId, setCategoryId] = useState<string | undefined>(line?.categoryId);
  const [payee, setPayee] = useState(transaction?.payee ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const example = money(150_000, currency).replace(/^[^\d-]+/, "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const magnitude = parseMoney(amount, currency, { numberFormat });
    const category = app.categories.find((c) => c.id === categoryId);
    if (account === undefined) return setProblem(t.tx_need_account());
    if (date === "") return setProblem(t.tx_need_date());
    if (magnitude === undefined || magnitude <= 0)
      return setProblem(t.tx_invalid_amount({ example }));
    if (category === undefined) return setProblem(t.tx_need_category());
    setProblem(undefined);
    setSaving(true);
    try {
      const stored = signedAmount(category.kind, magnitude);
      await app.act(async (engine) => {
        const text = { payee: payee.trim(), note: note.trim() };
        if (transaction === undefined || line === undefined) {
          await engine.recordTransaction({
            accountId,
            date,
            ...(text.payee !== "" ? { payee: text.payee } : {}),
            ...(text.note !== "" ? { note: text.note } : {}),
            lines: [{ categoryId: category.id, amount: stored }],
          });
        } else {
          await engine.editTransaction(transaction.id, { accountId, date, ...text });
          await engine.editLine(transaction.id, line.id, {
            categoryId: category.id,
            amount: stored,
          });
        }
      });
      onDone();
    } catch (error) {
      setProblem(t.tx_failed({ message: error instanceof Error ? error.message : String(error) }));
      setSaving(false);
    }
  }

  if (open.length === 0 && transaction === undefined)
    return <p className="mt-3 text-ink-muted">{t.tx_need_account()}</p>;

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span>{t.tx_amount()}</span>
        <input
          className={FIELD}
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1">{t.tx_category()}</legend>
        {app.categories.length === 0 ? (
          <p className="text-ink-muted">
            {t.tx_no_categories()}{" "}
            <Link to="/categories" className={`underline ${FOCUS}`} onClick={onDone}>
              {t.tx_create_category()}
            </Link>
          </p>
        ) : (
          <CategoryPicker
            categories={app.categories}
            recent={app.recentCategories}
            value={categoryId}
            onChange={setCategoryId}
          />
        )}
      </fieldset>
      <label className="flex flex-col gap-1">
        <span>{t.tx_account()}</span>
        <select className={FIELD} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {app.accounts
            .filter((a) => a.archivedAt === undefined || a.id === transaction?.accountId)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.tx_date()}</span>
        <input
          className={FIELD}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.tx_payee()}</span>
        <input className={FIELD} value={payee} onChange={(e) => setPayee(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.tx_note()}</span>
        <input className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className={`min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent disabled:opacity-60 ${FOCUS}`}
      >
        {transaction === undefined ? t.tx_add() : t.tx_save()}
      </button>
    </form>
  );
}

/** Add a Transaction, or edit one. Opens as a bottom sheet on a phone and a dialog elsewhere. */
export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
}) {
  const { t } = useLocale();
  const app = useApp();
  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(details) => onOpenChange(details.open)}
    >
      <Portal>
        <Dialog.Backdrop className="fixed inset-0 z-30 bg-ink/40" />
        <Dialog.Positioner className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
          <Dialog.Content className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 text-ink shadow-xl md:max-w-md md:rounded-2xl">
            <Dialog.Title className="text-lg font-semibold">
              {transaction === undefined ? t.add_transaction() : t.tx_title_edit()}
            </Dialog.Title>
            {app.status === "ready" && (
              <TransactionForm
                app={app}
                {...(transaction ? { transaction } : {})}
                onDone={() => onOpenChange(false)}
              />
            )}
            {app.status !== "ready" && (
              <p className="mt-2 text-sm text-ink-muted">{t.app_loading()}</p>
            )}
            <Dialog.CloseTrigger
              className={`mt-4 min-h-11 rounded-lg border border-control px-4 ${FOCUS}`}
            >
              {t.add_close()}
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
