import { convertMinor, currencyCodes, type CurrencyCode } from "@pfa/core";
import { Amount } from "../components/amount";
import { useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";
import { FIELD } from "../components/styles";
import { useDisplayCurrency } from "./display-currency";
import { useViewRate } from "./use-rates";
import type { SummaryData } from "./use-summary";

export type RateMode = "recorded" | "today";

/** Chooses whether foreign-currency Lines count at the rate they were recorded or today's. */
export function RateModeSwitch({
  value,
  onChange,
}: {
  value: RateMode;
  onChange: (mode: RateMode) => void;
}) {
  const { t } = useLocale();
  const option = (mode: RateMode, label: string) => (
    <button
      key={mode}
      type="button"
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
      className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink aria-pressed:border-accent aria-pressed:font-semibold aria-pressed:text-accent"
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={t.rate_mode_label()} className="flex flex-wrap gap-2">
      {option("recorded", t.rate_mode_recorded())}
      {option("today", t.rate_mode_today())}
    </div>
  );
}

/** What today's rates change, and which currencies had no rate and so were left out. */
export function RateEffectNote({ data }: { data: SummaryData }) {
  const { t, money } = useLocale();
  const text = useMoneyText();
  const { effect } = data;
  if (effect === undefined) return null;
  const amount = text(money(Math.abs(effect.difference), data.currency));
  const said =
    effect.difference > 0
      ? t.rate_effect_higher({ amount })
      : effect.difference < 0
        ? t.rate_effect_lower({ amount })
        : t.rate_effect_same();
  return (
    <div className="flex flex-col gap-1 text-sm text-ink-muted">
      <p>{said}</p>
      {effect.noRate.length > 0 && (
        <p role="status">{t.rate_no_rate({ currencies: effect.noRate.join(", ") })}</p>
      )}
    </div>
  );
}

/** A second currency for the totals, labelled as the view it is. The records are not touched. */
export function DisplayCurrencyView({ data, today }: { data: SummaryData; today: string }) {
  const { t, money } = useLocale();
  const [display] = useDisplayCurrency();
  const view = useViewRate(data.currency, display, today);
  if (display === undefined || display === data.currency) return null;
  if (view.status === "loading")
    return (
      <p className="text-sm text-ink-muted">{t.display_view_loading({ currency: display })}</p>
    );
  if (view.rate === undefined)
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t.display_view_no_rate({ base: data.currency, currency: display })}
      </p>
    );
  const rate = view.rate;
  const shown = (amount: number) => {
    try {
      return money(convertMinor(amount, rate, data.currency, display), display);
    } catch {
      return undefined;
    }
  };
  const net = data.income - data.spending.total;
  const rows: [string, number, "income" | "expense" | "neutral"][] = [
    [t.card_income(), data.income, "income"],
    [t.card_spending(), data.spending.total, "expense"],
    [t.card_net(), Math.abs(net), net > 0 ? "income" : net < 0 ? "expense" : "neutral"],
  ];
  return (
    <section
      aria-label={t.display_view_title({ currency: display })}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-4"
    >
      <h2 className="text-sm font-medium">{t.display_view_title({ currency: display })}</h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {rows.map(([label, amount, direction]) => {
          const formatted = shown(amount);
          return (
            <li key={label} className="flex flex-col">
              <span className="text-sm text-ink-muted">{label}</span>
              {formatted !== undefined && (
                <Amount direction={direction} variant="list" formatted={formatted} />
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">
        {t.display_view_note({ base: data.currency, currency: display, rate })}
      </p>
    </section>
  );
}

/** Settings: which currency, if any, Home also shows its totals in. */
export function DisplayCurrencyChoice({ base }: { base: CurrencyCode | undefined }) {
  const { t } = useLocale();
  const [display, setDisplay] = useDisplayCurrency();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">{t.settings_display_note()}</p>
      <label className="flex flex-col gap-1">
        <span>{t.label_display_currency()}</span>
        <select
          className={FIELD}
          value={display ?? ""}
          onChange={(e) =>
            setDisplay(e.target.value === "" ? undefined : (e.target.value as CurrencyCode))
          }
        >
          <option value="">{t.settings_display_none()}</option>
          {currencyCodes
            .filter((code) => code !== base)
            .map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
