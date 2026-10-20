import { shiftMonth, type Period } from "@pfa/core";
import { useLocale } from "../components/locale";
import { BUTTON } from "../components/styles";

/** Steps through months. The label is announced when it changes. */
export function PeriodSelector({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const { t, month } = useLocale();
  return (
    <div role="group" aria-label={t.period_label()} className="flex items-center gap-2">
      <button
        type="button"
        className={BUTTON}
        aria-label={t.period_previous()}
        onClick={() => onChange(shiftMonth(period, -1))}
      >
        ‹
      </button>
      <span className="min-w-36 text-center font-medium" aria-live="polite">
        {month(period.from)}
      </span>
      <button
        type="button"
        className={BUTTON}
        aria-label={t.period_next()}
        onClick={() => onChange(shiftMonth(period, 1))}
      >
        ›
      </button>
    </div>
  );
}
