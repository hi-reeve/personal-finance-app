import {
  parseMoney,
  type Occurrence,
  type OccurrenceStatus,
  type Transaction,
  type Transfer,
} from "@pfa/core";
import { useEffect, useState } from "react";
import type { ReadyState } from "../app/app-provider";
import { parseRateInput } from "../app/rate-input";
import { Amount } from "../components/amount";
import { useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";
import { RateField } from "../components/rate-field";
import { BUTTON, FIELD, FOCUS } from "../components/styles";

const LOOK: Record<OccurrenceStatus, { icon: string; className: string }> = {
  upcoming: { icon: "·", className: "text-ink-muted" },
  "due-soon": { icon: "!", className: "text-warning" },
  overdue: { icon: "✕", className: "" },
  paid: { icon: "✓", className: "text-success" },
  skipped: { icon: "–", className: "text-ink-muted" },
};

type Panel = "pay" | "link" | undefined;

/** One occurrence with what can be done to it: pay, link an existing one, skip or reopen. */
export function OccurrenceRow({
  app,
  occurrence,
  olderCount,
}: {
  app: ReadyState;
  occurrence: Occurrence;
  /** How many occurrences of this item are overdue before this one, for "skip all older". */
  olderCount: number;
}) {
  const { t, money, date: formatDate, numberFormat } = useLocale();
  const text = useMoneyText();
  const [panel, setPanel] = useState<Panel>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const account = app.accounts.find((a) => a.id === occurrence.accountId);
  const currency = account?.currency ?? app.settings.baseCurrency ?? "USD";
  const base = app.settings.baseCurrency;
  const plain = (minor: number) => money(minor, currency).replace(/^[^\d-]+/, "");
  const [paidAmount, setPaidAmount] = useState(plain(occurrence.expected));
  const [paidDate, setPaidDate] = useState(occurrence.due);
  const [rate, setRate] = useState("");
  const [candidates, setCandidates] = useState<{
    transactions: Transaction[];
    transfers: Transfer[];
  }>();
  const look = LOOK[occurrence.status];
  const status = {
    upcoming: t.recurring_status_upcoming(),
    "due-soon": t.recurring_status_due_soon(),
    overdue: t.recurring_status_overdue(),
    paid: t.recurring_status_paid(),
    skipped: t.recurring_status_skipped(),
  }[occurrence.status];
  const acts = occurrence.status !== "paid" && occurrence.status !== "skipped";
  const needsRate = base !== undefined && currency !== base && occurrence.kind !== "transfer";

  useEffect(() => {
    if (panel !== "link") return;
    let live = true;
    void app
      .read((engine) => engine.linkCandidates(occurrence.itemId, occurrence.due))
      .then(
        (found) => live && setCandidates(found),
        () => live && setCandidates({ transactions: [], transfers: [] }),
      );
    return () => {
      live = false;
    };
  }, [panel, app.read, app.version, occurrence.itemId, occurrence.due]);

  async function run(change: Parameters<ReadyState["act"]>[0]) {
    setProblem(undefined);
    try {
      await app.act(change);
      setPanel(undefined);
    } catch (error) {
      setProblem(
        t.recurring_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  function pay() {
    const amount = parseMoney(paidAmount, currency, { numberFormat });
    if (amount === undefined || amount <= 0)
      return setProblem(t.recurring_invalid_amount({ example: plain(1_500_000) }));
    const parsedRate = needsRate ? parseRateInput(rate, numberFormat) : undefined;
    if (needsRate && parsedRate === undefined) return setProblem(t.tx_need_rate());
    void run((engine) =>
      engine.markPaid(occurrence.itemId, occurrence.due, {
        amount,
        date: paidDate,
        ...(parsedRate !== undefined ? { rate: parsedRate } : {}),
      }),
    );
  }

  const difference =
    occurrence.difference === undefined || occurrence.difference === 0
      ? ""
      : occurrence.difference > 0
        ? t.recurring_less({ amount: money(occurrence.difference, currency) })
        : t.recurring_more({ amount: money(-occurrence.difference, currency) });

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate font-medium">{occurrence.name}</h3>
        <span
          className={
            occurrence.status === "overdue"
              ? "rounded-md bg-danger px-2 py-0.5 text-sm text-on-danger"
              : `text-sm font-medium ${look.className}`
          }
        >
          <span aria-hidden="true">{look.icon} </span>
          {status}
        </span>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-ink-muted">
        <span>{t.recurring_due({ date: formatDate(occurrence.due) })}</span>
        <Amount
          direction={
            occurrence.kind === "income"
              ? "income"
              : occurrence.kind === "expense"
                ? "expense"
                : "neutral"
          }
          variant="list"
          formatted={money(occurrence.expected, currency)}
        />
      </p>
      {occurrence.paid !== undefined && (
        <p className="text-sm text-ink-muted">
          {text(
            `${t.recurring_expected_paid({
              expected: money(occurrence.expected, currency),
              paid: money(occurrence.paid, currency),
            })}${difference ? `, ${difference}` : ""}`,
          )}
        </p>
      )}
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {panel === "pay" && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span>{t.recurring_paid_amount()}</span>
            <input
              className={FIELD}
              inputMode="decimal"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>{t.recurring_paid_date()}</span>
            <input
              className={FIELD}
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </label>
          {needsRate && base !== undefined && (
            <RateField
              date={paidDate}
              from={currency}
              to={base}
              value={rate}
              onChange={setRate}
              amount={parseMoney(paidAmount, currency, { numberFormat })}
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={`min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent ${FOCUS}`}
              onClick={pay}
            >
              {t.recurring_confirm_paid()}
            </button>
            <button type="button" className={BUTTON} onClick={() => setPanel(undefined)}>
              {t.recurring_cancel()}
            </button>
          </div>
        </div>
      )}
      {panel === "link" && (
        <div className="flex flex-col gap-2">
          {candidates === undefined ? null : candidates.transactions.length +
              candidates.transfers.length ===
            0 ? (
            <p className="text-sm text-ink-muted">{t.recurring_link_none()}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.transactions.map((tx) => {
                const label =
                  `${formatDate(tx.date)} ${tx.payee ?? ""} ${money(Math.abs(tx.total), currency)}`
                    .replace(/\s+/g, " ")
                    .trim();
                return (
                  <li key={tx.id}>
                    <button
                      type="button"
                      className={BUTTON}
                      aria-label={t.recurring_link_choose_for({ label })}
                      onClick={() =>
                        void run((engine) =>
                          engine.linkOccurrence(occurrence.itemId, occurrence.due, {
                            transactionId: tx.id,
                          }),
                        )
                      }
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
              {candidates.transfers.map((tr) => {
                const label = `${formatDate(tr.date)} ${money(tr.fromAmount, currency)}`;
                return (
                  <li key={tr.id}>
                    <button
                      type="button"
                      className={BUTTON}
                      aria-label={t.recurring_link_choose_for({ label })}
                      onClick={() =>
                        void run((engine) =>
                          engine.linkOccurrence(occurrence.itemId, occurrence.due, {
                            transferId: tr.id,
                          }),
                        )
                      }
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className={BUTTON} onClick={() => setPanel(undefined)}>
            {t.recurring_cancel()}
          </button>
        </div>
      )}
      {panel === undefined && (
        <div className="flex flex-wrap gap-2">
          {acts && (
            <>
              <button
                type="button"
                className={BUTTON}
                aria-label={t.recurring_paid_for({ name: occurrence.name })}
                onClick={() => setPanel("pay")}
              >
                {t.recurring_mark_paid()}
              </button>
              <button
                type="button"
                className={BUTTON}
                aria-label={t.recurring_link_for({ name: occurrence.name })}
                onClick={() => setPanel("link")}
              >
                {t.recurring_link()}
              </button>
              <button
                type="button"
                className={BUTTON}
                aria-label={t.recurring_skip_for({ name: occurrence.name })}
                onClick={() =>
                  void run((engine) => engine.skipOccurrence(occurrence.itemId, occurrence.due))
                }
              >
                {t.recurring_skip()}
              </button>
              {olderCount > 0 && (
                <button
                  type="button"
                  className={BUTTON}
                  aria-label={t.recurring_skip_older_for({ name: occurrence.name })}
                  onClick={() =>
                    void run((engine) => engine.skipOlder(occurrence.itemId, occurrence.due))
                  }
                >
                  {t.recurring_skip_older()}
                </button>
              )}
            </>
          )}
          {occurrence.status === "skipped" && (
            <button
              type="button"
              className={BUTTON}
              aria-label={t.recurring_reopen_for({ name: occurrence.name })}
              onClick={() =>
                void run((engine) => engine.reopenOccurrence(occurrence.itemId, occurrence.due))
              }
            >
              {t.recurring_reopen()}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
