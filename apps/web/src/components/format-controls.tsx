import { DEFAULT_NEAR_LIMIT, formatDate, type DateFormat, type NumberFormat } from "@pfa/core";
import { useState } from "react";
import { useApp } from "../app/app-provider";
import { Choice } from "./appearance";
import { DATE_FORMATS, NUMBER_FORMATS, useLocale } from "./locale";
import { FIELD } from "./styles";

/**
 * Number and date format, kept in the synced settings so every device agrees. The change applies
 * here at once; the write to the shared settings follows, and a failure is said out loud.
 */
export function SyncedFormatControls() {
  const { t, language, numberFormat, dateFormat, setNumberFormat, setDateFormat } = useLocale();
  const app = useApp();
  const [problem, setProblem] = useState<string | undefined>(undefined);

  /** Saves to the synced settings; on failure puts this device back as it was and says so. */
  async function save(patch: { numberFormat?: NumberFormat; dateFormat?: DateFormat }) {
    const before = { numberFormat, dateFormat };
    setProblem(undefined);
    if (app.status !== "ready") return;
    try {
      await app.act((engine) => engine.setPreferences(patch));
    } catch (error) {
      if (patch.numberFormat !== undefined) setNumberFormat(before.numberFormat);
      if (patch.dateFormat !== undefined) setDateFormat(before.dateFormat);
      setProblem(
        t.settings_synced_failed({
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  const numberLabels: Record<NumberFormat, string> = {
    "dot-comma": t.number_format_dot_comma(),
    "comma-dot": t.number_format_comma_dot(),
  };
  const sample = "2026-10-18";
  const dateLabels = Object.fromEntries(
    DATE_FORMATS.map((f) => [f, formatDate(sample, language, f)]),
  ) as Record<DateFormat, string>;

  return (
    <div className="flex flex-col gap-4">
      <Choice
        label={t.label_number_format()}
        options={NUMBER_FORMATS}
        labels={numberLabels}
        value={numberFormat}
        onChange={(next) => {
          setNumberFormat(next);
          void save({ numberFormat: next });
        }}
      />
      <Choice
        label={t.label_date_format()}
        options={DATE_FORMATS}
        labels={dateLabels}
        value={dateFormat}
        onChange={(next) => {
          setDateFormat(next);
          void save({ dateFormat: next });
        }}
      />
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

/** The percent of a budget at which it counts as near its limit. Synced, saved as soon as it is valid. */
export function BudgetLimitControl() {
  const { t } = useLocale();
  const app = useApp();
  const saved =
    app.status === "ready"
      ? (app.settings.budgetNearLimit ?? DEFAULT_NEAR_LIMIT)
      : DEFAULT_NEAR_LIMIT;
  const [text, setText] = useState(String(saved));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const valid = /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 99;

  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span>{t.label_near_limit()}</span>
        <input
          className={`${FIELD} max-w-32`}
          inputMode="numeric"
          aria-invalid={!valid}
          aria-describedby="near-limit-help"
          value={text}
          onChange={async (event) => {
            const next = event.target.value;
            setText(next);
            setProblem(undefined);
            const percent = Number(next);
            if (!/^\d{1,2}$/.test(next.trim()) || percent < 1 || percent > 99) return;
            if (app.status !== "ready" || percent === saved) return;
            try {
              await app.act((engine) => engine.setPreferences({ budgetNearLimit: percent }));
            } catch (error) {
              setProblem(
                t.settings_synced_failed({
                  message: error instanceof Error ? error.message : String(error),
                }),
              );
            }
          }}
        />
      </label>
      <p id="near-limit-help" className="text-sm text-danger" role={valid ? undefined : "alert"}>
        {valid ? "" : t.near_limit_invalid()}
        {problem}
      </p>
    </div>
  );
}
