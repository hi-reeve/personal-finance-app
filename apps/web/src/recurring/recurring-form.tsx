import {
  RECURRING_KINDS,
  RECURRING_UNITS,
  parseMoney,
  priceOn,
  type RecurringItem,
  type RecurringKind,
  type RecurringUnit,
} from "@pfa/core";
import { useState, type FormEvent } from "react";
import type { ReadyState } from "../app/app-provider";
import { today } from "../app/today";
import { CategoryPicker } from "../components/category-picker";
import { useLocale } from "../components/locale";
import { BUTTON, FIELD, FOCUS } from "../components/styles";

type End = "never" | "date" | "count";

/** A template for something that repeats. Changes reach future occurrences only. */
export function RecurringForm({
  app,
  item,
  onDone,
  onCancel,
}: {
  app: ReadyState;
  item?: RecurringItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t, money, numberFormat } = useLocale();
  const open = app.accounts.filter((a) => a.archivedAt === undefined || a.id === item?.accountId);
  const plain = (minor: number, currency: Parameters<typeof money>[1]) =>
    money(minor, currency).replace(/^[^\d-]+/, "");
  const [name, setName] = useState(item?.name ?? "");
  const [kind, setKind] = useState<RecurringKind>(item?.kind ?? "expense");
  const [accountId, setAccountId] = useState(item?.accountId ?? open[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(
    item?.toAccountId ?? open.find((a) => a.id !== accountId)?.id ?? "",
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(item?.categoryId);
  const account = app.accounts.find((a) => a.id === accountId);
  const now = today();
  const currentPrice = item ? priceOn(item, now) : undefined;
  const [amount, setAmount] = useState(
    item && account && currentPrice !== undefined ? plain(currentPrice, account.currency) : "",
  );
  const [priceFrom, setPriceFrom] = useState(now);
  const [subscription, setSubscription] = useState(item?.subscription ?? false);
  const [every, setEvery] = useState(String(item?.every ?? 1));
  const [unit, setUnit] = useState<RecurringUnit>(item?.unit ?? "month");
  const [start, setStart] = useState(item?.start ?? today());
  const [lastDay, setLastDay] = useState(item?.lastDay ?? false);
  const [end, setEnd] = useState<End>(
    item?.endDate !== undefined ? "date" : item?.endCount !== undefined ? "count" : "never",
  );
  const [endDate, setEndDate] = useState(item?.endDate ?? "");
  const [endCount, setEndCount] = useState(String(item?.endCount ?? ""));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return setProblem(t.recurring_need_name());
    if (kind !== "transfer" && categoryId === undefined)
      return setProblem(t.recurring_need_category());
    const parsed = account ? parseMoney(amount, account.currency, { numberFormat }) : undefined;
    if (parsed === undefined || parsed <= 0)
      return setProblem(
        t.recurring_invalid_amount({ example: plain(1_500_000, account?.currency ?? "USD") }),
      );
    const repeat = /^\d+$/.test(every.trim()) ? Number(every) : 0;
    if (repeat <= 0) return setProblem(t.recurring_invalid_every());
    if (start === "" || (end === "date" && endDate === ""))
      return setProblem(t.recurring_need_date());
    const count =
      end === "count" ? (/^\d+$/.test(endCount.trim()) ? Number(endCount) : 0) : undefined;
    if (count !== undefined && count <= 0) return setProblem(t.recurring_invalid_every());
    setProblem(undefined);
    setSaving(true);
    try {
      const shared = {
        name: name.trim(),
        kind,
        accountId,
        amount: parsed,
        every: repeat,
        unit,
        start,
        lastDay: lastDay && (unit === "month" || unit === "year"),
        subscription: kind === "expense" && subscription,
      };
      // A new price on a bill reaches occurrences from a date on; earlier ones keep theirs.
      const repriced = item !== undefined && kind !== "transfer" && parsed !== currentPrice;
      await app.act(async (engine) => {
        if (item === undefined)
          return engine.createRecurring({
            ...shared,
            ...(kind === "transfer" ? { toAccountId } : { categoryId: categoryId! }),
            ...(end === "date" ? { endDate } : {}),
            ...(count !== undefined ? { endCount: count } : {}),
          });
        const { amount: _unchanged, ...rest } = shared;
        const updated = await engine.updateRecurring(item.id, {
          ...(kind === "transfer" ? shared : rest),
          toAccountId: kind === "transfer" ? toAccountId : null,
          categoryId: kind === "transfer" ? null : categoryId!,
          endDate: end === "date" ? endDate : null,
          endCount: count ?? null,
        });
        return repriced ? engine.changeRecurringPrice(item.id, parsed, priceFrom) : updated;
      });
      onDone();
    } catch (error) {
      setProblem(
        t.recurring_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
      setSaving(false);
    }
  }

  const accountOptions = open.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name} ({a.currency})
    </option>
  ));
  const chosen = app.categories.filter((c) => c.kind === kind);

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
    >
      <label className="flex flex-col gap-1">
        <span>{t.recurring_name()}</span>
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.recurring_kind()}</span>
        <select
          className={FIELD}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as RecurringKind);
            setCategoryId(undefined);
          }}
        >
          {RECURRING_KINDS.map((k) => (
            <option key={k} value={k}>
              {t[`recurring_kind_${k}`]()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.recurring_account()}</span>
        <select className={FIELD} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accountOptions}
        </select>
      </label>
      {kind === "transfer" ? (
        <label className="flex flex-col gap-1">
          <span>{t.recurring_to_account()}</span>
          <select
            className={FIELD}
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
          >
            {accountOptions}
          </select>
        </label>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1">{t.recurring_category()}</legend>
          <CategoryPicker
            categories={chosen}
            recent={[]}
            kind={kind}
            value={categoryId}
            onChange={setCategoryId}
          />
        </fieldset>
      )}
      <label className="flex flex-col gap-1">
        <span>{t.recurring_amount()}</span>
        <input
          className={FIELD}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span>{t.recurring_every()}</span>
          <input
            className={FIELD}
            inputMode="numeric"
            value={every}
            onChange={(e) => setEvery(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span>{t.recurring_unit()}</span>
          <select
            className={FIELD}
            value={unit}
            onChange={(e) => setUnit(e.target.value as RecurringUnit)}
          >
            {RECURRING_UNITS.map((u) => (
              <option key={u} value={u}>
                {t[`recurring_unit_${u}`]()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span>{t.recurring_start()}</span>
        <input
          className={FIELD}
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      {item !== undefined && kind !== "transfer" && (
        <label className="flex flex-col gap-1">
          <span>{t.recurring_price_from()}</span>
          <input
            className={FIELD}
            type="date"
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
          />
        </label>
      )}
      {kind === "expense" && (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={subscription}
            onChange={(e) => setSubscription(e.target.checked)}
          />
          <span>{t.recurring_subscription()}</span>
        </label>
      )}
      {(unit === "month" || unit === "year") && (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={lastDay}
            onChange={(e) => setLastDay(e.target.checked)}
          />
          <span>{t.recurring_last_day()}</span>
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span>{t.recurring_end()}</span>
        <select className={FIELD} value={end} onChange={(e) => setEnd(e.target.value as End)}>
          <option value="never">{t.recurring_end_never()}</option>
          <option value="date">{t.recurring_end_date()}</option>
          <option value="count">{t.recurring_end_count()}</option>
        </select>
      </label>
      {end === "date" && (
        <label className="flex flex-col gap-1">
          <span>{t.recurring_end_date_value()}</span>
          <input
            className={FIELD}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      )}
      {end === "count" && (
        <label className="flex flex-col gap-1">
          <span>{t.recurring_end_count_value()}</span>
          <input
            className={FIELD}
            inputMode="numeric"
            value={endCount}
            onChange={(e) => setEndCount(e.target.value)}
          />
        </label>
      )}
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className={`min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent disabled:opacity-60 ${FOCUS}`}
        >
          {t.recurring_save()}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          {t.recurring_cancel()}
        </button>
      </div>
    </form>
  );
}
