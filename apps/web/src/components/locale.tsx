import {
  dateFormats,
  formatDate,
  formatDay,
  formatMonth,
  formatMonthShort,
  formatMoney,
  type CurrencyCode,
  type DateFormat,
  type Language,
  type NumberFormat,
} from "@pfa/core";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale, setLocale } from "../paraglide/runtime.js";
import { Choice } from "./appearance";

const FORMAT_KEY = "pfa.number-format";
const DATE_FORMAT_KEY = "pfa.date-format";

export const LANGUAGES = ["en", "id"] as const satisfies readonly Language[];
export const DATE_FORMATS = dateFormats;
export const NUMBER_FORMATS = ["dot-comma", "comma-dot"] as const satisfies readonly NumberFormat[];

/** Indonesian writes 1.234,50; English writes 1,234.50. Only the first-run default: the two are independent. */
const usualFormat = (language: Language): NumberFormat =>
  language === "id" ? "dot-comma" : "comma-dot";

function readDateFormat(): DateFormat {
  try {
    const stored = localStorage.getItem(DATE_FORMAT_KEY);
    if (DATE_FORMATS.includes(stored as DateFormat)) return stored as DateFormat;
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return "medium";
}

function readNumberFormat(language: Language): NumberFormat {
  try {
    const stored = localStorage.getItem(FORMAT_KEY);
    if (NUMBER_FORMATS.includes(stored as NumberFormat)) return stored as NumberFormat;
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return usualFormat(language);
}

interface LocaleState {
  language: Language;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
  setLanguage: (language: Language) => void;
  setNumberFormat: (numberFormat: NumberFormat) => void;
  setDateFormat: (dateFormat: DateFormat) => void;
  /** Message functions; they read the current language, so call them while rendering. */
  t: typeof m;
  money: (amount: number, currency: CurrencyCode) => string;
  date: (isoDate: string) => string;
  /** "October 2026" */
  month: (isoDate: string) => string;
  /** "18 Oct" */
  day: (isoDate: string) => string;
  /** "Oct" */
  monthShort: (isoDate: string) => string;
}

const LocaleContext = createContext<LocaleState | null>(null);

/**
 * Language and number format are two device settings. Neither is part of the URL, and changing
 * either re-renders in place. The language is kept by Paraglide; the number format is kept here.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setCurrentLanguage] = useState<Language>(() => getLocale());
  const [dateFormat, setCurrentDateFormat] = useState<DateFormat>(readDateFormat);
  const [numberFormat, setCurrentFormat] = useState<NumberFormat>(() =>
    readNumberFormat(getLocale()),
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LocaleState>(
    () => ({
      language,
      numberFormat,
      dateFormat,
      setLanguage(next) {
        void setLocale(next, { reload: false });
        setCurrentLanguage(next);
      },
      setNumberFormat(next) {
        try {
          localStorage.setItem(FORMAT_KEY, next);
        } catch {
          // The choice then lasts only for this session.
        }
        setCurrentFormat(next);
      },
      setDateFormat(next) {
        try {
          localStorage.setItem(DATE_FORMAT_KEY, next);
        } catch {
          // The choice then lasts only for this session.
        }
        setCurrentDateFormat(next);
      },
      t: m,
      money: (amount, currency) => formatMoney(amount, currency, { numberFormat }),
      date: (isoDate) => formatDate(isoDate, language, dateFormat),
      month: (isoDate) => formatMonth(isoDate, language),
      day: (isoDate) => formatDay(isoDate, language),
      monthShort: (isoDate) => formatMonthShort(isoDate, language),
    }),
    [language, numberFormat, dateFormat],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  const value = useContext(LocaleContext);
  if (value === null) throw new Error("useLocale needs a LocaleProvider above it");
  return value;
}

export function LanguageChoice() {
  const { language, setLanguage, t } = useLocale();
  const labels: Record<Language, string> = { en: t.language_en(), id: t.language_id() };
  return (
    <Choice
      label={t.label_language()}
      options={LANGUAGES}
      labels={labels}
      value={language}
      onChange={setLanguage}
    />
  );
}

/** Language and number format together, for first run, before anything is set up or synced. */
export function LocaleControls() {
  const { numberFormat, setNumberFormat, t } = useLocale();
  const formatLabels: Record<NumberFormat, string> = {
    "dot-comma": t.number_format_dot_comma(),
    "comma-dot": t.number_format_comma_dot(),
  };
  return (
    <div className="flex flex-col gap-4">
      <LanguageChoice />
      <Choice
        label={t.label_number_format()}
        options={NUMBER_FORMATS}
        labels={formatLabels}
        value={numberFormat}
        onChange={setNumberFormat}
      />
    </div>
  );
}
