import { convertMinor, type CurrencyCode } from "@pfa/core";
import { useEffect, useRef, useState } from "react";
import { formatRateInput, parseRateInput } from "../app/rate-input";
import { rateProvider } from "../app/rates";
import { useLocale } from "./locale";
import { FIELD } from "./styles";

type Status = "idle" | "loading" | "cache" | "network" | "missing";

/**
 * The exchange rate for an Account that is not in the base currency. It fills in the rate for the
 * Transaction's day when one can be found, and always lets the user type one, so being offline
 * or an unsupported currency never blocks saving.
 */
export function RateField({
  date,
  from,
  to,
  value,
  onChange,
  amount,
  invalid,
}: {
  date: string;
  /** The Account's currency. */
  from: CurrencyCode;
  /** The base currency. */
  to: CurrencyCode;
  value: string;
  onChange: (value: string) => void;
  /** Minor units in `from`, to show what it comes to in `to`. */
  amount?: number | undefined;
  invalid?: boolean;
}) {
  const { t, money, numberFormat } = useLocale();
  const [status, setStatus] = useState<Status>("idle");
  const typed = useRef(value !== "");
  const send = useRef(onChange);
  send.current = onChange;

  useEffect(() => {
    if (date === "") return;
    let live = true;
    setStatus("loading");
    void rateProvider.lookup(date, from, to).then((found) => {
      if (!live) return;
      if (found === undefined) return setStatus("missing");
      setStatus(found.source === "cache" ? "cache" : "network");
      // A rate the user typed, or one already saved on the Transaction, is not overwritten.
      if (!typed.current) send.current(formatRateInput(found.rate, numberFormat));
    });
    return () => {
      live = false;
    };
  }, [date, from, to, numberFormat]);

  const parsed = parseRateInput(value, numberFormat);
  const preview =
    parsed !== undefined && amount !== undefined && amount !== 0
      ? money(convertMinor(amount, parsed, from, to), to)
      : undefined;
  const example = formatRateInput("16250.5", numberFormat);
  const statusText =
    status === "loading"
      ? t.rate_loading()
      : status === "missing"
        ? t.rate_missing()
        : status === "cache"
          ? t.rate_saved()
          : status === "network"
            ? t.rate_fetched()
            : "";

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span>{t.rate_label({ from, to })}</span>
        <input
          className={FIELD}
          inputMode="decimal"
          aria-invalid={invalid === true || (value !== "" && parsed === undefined)}
          aria-describedby="rate-help"
          value={value}
          onChange={(e) => {
            typed.current = true;
            onChange(e.target.value);
          }}
        />
      </label>
      <p id="rate-help" className="text-sm text-ink-muted" aria-live="polite">
        {statusText}
        {preview !== undefined && ` ${t.rate_preview({ amount: preview })}`}
        {value !== "" && parsed === undefined && ` ${t.rate_invalid({ example })}`}
      </p>
    </div>
  );
}
