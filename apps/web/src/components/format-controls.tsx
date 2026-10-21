import { formatDate, type DateFormat, type NumberFormat } from "@pfa/core";
import { useState } from "react";
import { useApp } from "../app/app-provider";
import { Choice } from "./appearance";
import { DATE_FORMATS, NUMBER_FORMATS, useLocale } from "./locale";

/**
 * Number and date format, kept in the synced settings so every device agrees. The change applies
 * here at once; the write to the shared settings follows, and a failure is said out loud.
 */
export function SyncedFormatControls() {
  const { t, language, numberFormat, dateFormat, setNumberFormat, setDateFormat } = useLocale();
  const app = useApp();
  const [problem, setProblem] = useState<string | undefined>(undefined);

  async function save(patch: { numberFormat?: NumberFormat; dateFormat?: DateFormat }) {
    setProblem(undefined);
    if (app.status !== "ready") return;
    try {
      await app.act((engine) => engine.setPreferences(patch));
    } catch (error) {
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
