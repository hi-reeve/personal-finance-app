import { parseMoney, type Transfer } from "@pfa/core";
import { useState, type FormEvent } from "react";
import type { ReadyState } from "../app/app-provider";
import { today } from "../app/today";
import { CategoryPicker } from "./category-picker";
import { useLocale } from "./locale";

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** Move money between two of the user's own Accounts, optionally with a fee. */
export function TransferForm({
  app,
  transfer,
  onDone,
}: {
  app: ReadyState;
  transfer?: Transfer;
  onDone: () => void;
}) {
  const { t, money, numberFormat } = useLocale();
  const open = app.accounts.filter((a) => a.archivedAt === undefined);
  const plain = (minor: number, currency: Parameters<typeof money>[1]) =>
    money(minor, currency).replace(/^[^\d-]+/, "");
  const accountOf = (id: string) => app.accounts.find((a) => a.id === id);

  const [fromId, setFromId] = useState(transfer?.fromAccountId ?? open[0]?.id ?? "");
  const [toId, setToId] = useState(
    transfer?.toAccountId ?? open.find((a) => a.id !== fromId)?.id ?? "",
  );
  const from = accountOf(fromId);
  const to = accountOf(toId);
  const sameCurrency = from !== undefined && to !== undefined && from.currency === to.currency;
  const [sent, setSent] = useState(
    transfer && from ? plain(transfer.fromAmount, from.currency) : "",
  );
  const [received, setReceived] = useState(
    transfer && to ? plain(transfer.toAmount, to.currency) : "",
  );
  const [fee, setFee] = useState(
    transfer?.fee && from ? plain(transfer.fee.amount, from.currency) : "",
  );
  const [feeCategory, setFeeCategory] = useState<string | undefined>(transfer?.fee?.categoryId);
  const [date, setDate] = useState(transfer?.date ?? today());
  const [note, setNote] = useState(transfer?.note ?? "");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const example = money(150_000, from?.currency ?? "USD").replace(/^[^\d-]+/, "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (from === undefined || to === undefined) return setProblem(t.tr_need_two());
    if (date === "") return setProblem(t.tx_need_date());
    const fromAmount = parseMoney(sent, from.currency, { numberFormat });
    const toAmount = sameCurrency
      ? fromAmount
      : parseMoney(received, to.currency, { numberFormat });
    if (fromAmount === undefined || fromAmount <= 0 || toAmount === undefined || toAmount <= 0)
      return setProblem(t.tx_invalid_amount({ example }));
    let feeInput: { amount: number; categoryId: string } | null = null;
    if (fee.trim() !== "") {
      const amount = parseMoney(fee, from.currency, { numberFormat });
      if (amount === undefined || amount <= 0) return setProblem(t.tr_invalid_fee({ example }));
      if (feeCategory === undefined) return setProblem(t.tr_need_fee_category());
      feeInput = { amount, categoryId: feeCategory };
    }
    setProblem(undefined);
    setSaving(true);
    try {
      await app.act(async (engine) => {
        const text = { date, note: note.trim() };
        if (transfer === undefined) {
          await engine.recordTransfer({
            fromAccountId: from.id,
            toAccountId: to.id,
            fromAmount,
            toAmount,
            date,
            ...(text.note !== "" ? { note: text.note } : {}),
            ...(feeInput ? { fee: feeInput } : {}),
          });
        } else {
          await engine.updateTransfer(transfer.id, {
            fromAccountId: from.id,
            toAccountId: to.id,
            fromAmount,
            toAmount,
            ...text,
            fee: feeInput,
          });
        }
      });
      onDone();
    } catch (error) {
      setProblem(t.tx_failed({ message: error instanceof Error ? error.message : String(error) }));
      setSaving(false);
    }
  }

  if (open.length < 2 && transfer === undefined)
    return <p className="mt-3 text-ink-muted">{t.tr_need_two()}</p>;

  const choices = app.accounts
    .filter(
      (a) =>
        a.archivedAt === undefined ||
        a.id === transfer?.fromAccountId ||
        a.id === transfer?.toAccountId,
    )
    .map((a) => (
      <option key={a.id} value={a.id}>
        {a.name}
      </option>
    ));
  // Picking the other side's Account swaps the two, so either can always be changed.
  const pickFrom = (id: string) => {
    if (id === toId) setToId(fromId);
    setFromId(id);
  };
  const pickTo = (id: string) => {
    if (id === fromId) setFromId(toId);
    setToId(id);
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span>{t.tr_from()}</span>
        <select className={FIELD} value={fromId} onChange={(e) => pickFrom(e.target.value)}>
          {choices}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.tr_to()}</span>
        <select className={FIELD} value={toId} onChange={(e) => pickTo(e.target.value)}>
          {choices}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.tr_sent()}</span>
        <input
          className={FIELD}
          inputMode="decimal"
          autoFocus
          value={sent}
          onChange={(e) => setSent(e.target.value)}
        />
      </label>
      {!sameCurrency && (
        <label className="flex flex-col gap-1">
          <span>{t.tr_received()}</span>
          <input
            className={FIELD}
            inputMode="decimal"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span>{t.tr_fee()}</span>
        <input
          className={FIELD}
          inputMode="decimal"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
      </label>
      {fee.trim() !== "" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">{t.tr_fee_category()}</legend>
          <CategoryPicker
            categories={app.categories}
            recent={app.recentCategories}
            value={feeCategory}
            onChange={setFeeCategory}
            kind="expense"
          />
        </fieldset>
      )}
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
        {transfer === undefined ? t.tr_add() : t.tr_save()}
      </button>
    </form>
  );
}
