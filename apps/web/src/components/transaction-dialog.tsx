import { BALANCE_ADJUSTMENT_CATEGORY, parseMoney, signedAmount, type Transaction } from "@pfa/core";
import { Dialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { Link } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { useApp, type ReadyState } from "../app/app-provider";
import { today } from "../app/today";
import { useCategoryLabel } from "./category-label";
import { CategoryPicker } from "./category-picker";
import { useLocale } from "./locale";

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BUTTON =
  "min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Everything but a Balance adjustment can be edited; those are changed by adjusting again. */
export function isEditable(transaction: Transaction): boolean {
  return transaction.lines.every((line) => line.categoryId !== BALANCE_ADJUSTMENT_CATEGORY);
}

interface LineDraft {
  /** Stable React key. */
  key: number;
  /** The stored Line, when editing one that already exists. */
  id?: string;
  amount: string;
  categoryId?: string | undefined;
  itemName: string;
  /** Category picker shown on a split Line. */
  picking: boolean;
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
  const label = useCategoryLabel(app.categories);
  const open = app.accounts.filter((a) => a.archivedAt === undefined);
  // The chosen default, else the Account used last, else the first one.
  const lastUsed = app.activity.find((tx) => open.some((a) => a.id === tx.accountId))?.accountId;
  const chosen = open.find((a) => a.id === app.settings.defaultAccountId)?.id;
  const defaultAccount = chosen ?? lastUsed ?? open[0]?.id;
  const [accountId, setAccountId] = useState(transaction?.accountId ?? defaultAccount ?? "");
  const account = app.accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? app.settings.baseCurrency ?? "USD";
  const plain = (minor: number) => money(Math.abs(minor), currency).replace(/^[^\d-]+/, "");
  const nextKey = useRef(0);
  const draft = (init: Partial<LineDraft> = {}): LineDraft => ({
    key: nextKey.current++,
    amount: "",
    itemName: "",
    picking: false,
    ...init,
  });
  const [lines, setLines] = useState<LineDraft[]>(() =>
    transaction
      ? transaction.lines.map((line) =>
          draft({
            id: line.id,
            amount: plain(line.amount),
            categoryId: line.categoryId,
            itemName: line.itemName ?? "",
          }),
        )
      : [draft()],
  );
  const [date, setDate] = useState(transaction?.date ?? today());
  const [payee, setPayee] = useState(transaction?.payee ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const example = money(150_000, currency).replace(/^[^\d-]+/, "");
  const split = lines.length > 1;
  const kindOf = (id: string | undefined) => app.categories.find((c) => c.id === id)?.kind;
  // A split Transaction is all spending or all income, so later Lines follow the first chosen kind.
  const kind = split
    ? lines.map((l) => kindOf(l.categoryId)).find((k) => k !== undefined)
    : undefined;
  const change = (key: number, patch: Partial<LineDraft>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const magnitudes = lines.map((l) => parseMoney(l.amount, currency, { numberFormat }));
  const total = magnitudes.every((m) => m !== undefined)
    ? magnitudes.reduce<number>((sum, m) => sum + (m ?? 0), 0)
    : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (account === undefined) return setProblem(t.tx_need_account());
    if (date === "") return setProblem(t.tx_need_date());
    const stored: { id?: string; categoryId: string; amount: number; itemName?: string }[] = [];
    const kinds = new Set<string>();
    for (const [index, line] of lines.entries()) {
      const magnitude = magnitudes[index];
      const category = app.categories.find((c) => c.id === line.categoryId);
      if (magnitude === undefined || magnitude <= 0)
        return setProblem(t.tx_invalid_amount({ example }));
      if (category === undefined) return setProblem(t.tx_need_category());
      kinds.add(category.kind);
      stored.push({
        ...(line.id !== undefined ? { id: line.id } : {}),
        categoryId: category.id,
        amount: signedAmount(category.kind, magnitude),
        // An empty name clears an existing one.
        ...(line.itemName.trim() !== "" || line.id !== undefined
          ? { itemName: line.itemName.trim() }
          : {}),
      });
    }
    if (kinds.size > 1) return setProblem(t.tx_mixed_kinds());
    setProblem(undefined);
    setSaving(true);
    try {
      const text = { payee: payee.trim(), note: note.trim() };
      await app.act(async (engine) => {
        if (transaction === undefined) {
          await engine.recordTransaction({
            accountId,
            date,
            ...(text.payee !== "" ? { payee: text.payee } : {}),
            ...(text.note !== "" ? { note: text.note } : {}),
            lines: stored.map(({ id: _id, ...line }) => line),
          });
        } else {
          await engine.updateTransaction(transaction.id, { accountId, date, ...text }, stored);
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

  const picker = (line: LineDraft) =>
    app.categories.length === 0 ? (
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
        value={line.categoryId}
        onChange={(id) => change(line.key, { categoryId: id, picking: false })}
        {...(kind !== undefined ? { kind } : {})}
      />
    );

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
      {split ? (
        lines.map((line, index) => (
          <fieldset
            key={line.key}
            className="flex flex-col gap-2 rounded-xl border border-line p-3"
          >
            <legend className="px-1">{t.tx_line({ n: index + 1 })}</legend>
            <label className="flex flex-col gap-1">
              <span>{t.tx_amount()}</span>
              <input
                className={FIELD}
                inputMode="decimal"
                value={line.amount}
                onChange={(e) => change(line.key, { amount: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t.tx_item()}</span>
              <input
                className={FIELD}
                value={line.itemName}
                onChange={(e) => change(line.key, { itemName: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {line.categoryId !== undefined ? label(line.categoryId) : t.tx_no_category()}
              </span>
              <button
                type="button"
                className={BUTTON}
                aria-expanded={line.picking || line.categoryId === undefined}
                aria-label={t.tx_change_category({ n: index + 1 })}
                onClick={() => change(line.key, { picking: !line.picking })}
              >
                {t.tx_change()}
              </button>
              <button
                type="button"
                className={BUTTON}
                aria-label={t.tx_remove_line({ n: index + 1 })}
                onClick={() => setLines((all) => all.filter((l) => l.key !== line.key))}
              >
                {t.tx_remove()}
              </button>
            </div>
            {(line.picking || line.categoryId === undefined) && picker(line)}
          </fieldset>
        ))
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span>{t.tx_amount()}</span>
            <input
              className={FIELD}
              inputMode="decimal"
              autoFocus
              value={lines[0]!.amount}
              onChange={(e) => change(lines[0]!.key, { amount: e.target.value })}
            />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1">{t.tx_category()}</legend>
            {picker(lines[0]!)}
          </fieldset>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setLines((all) => [...all, draft({ picking: true })])}
        >
          {split ? t.tx_add_line() : t.tx_split()}
        </button>
        {split && (
          <p className="ms-auto font-medium">
            {t.tx_total()}: {total !== undefined ? money(total, currency) : "—"}
          </p>
        )}
      </div>
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
