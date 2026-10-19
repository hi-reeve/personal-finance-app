import { dinero, toDecimal } from "dinero.js";
import { format, parse } from "date-fns";
import { enUS, id } from "date-fns/locale";
import { assertDate } from "./validate";

export type Language = "id" | "en";
/** `dot-comma` is 1.234,50 (Indonesian style); `comma-dot` is 1,234.50. Independent of the language. */
export type NumberFormat = "dot-comma" | "comma-dot";

interface CurrencyInfo {
  /** Digits after the decimal point; 0 for rupiah and yen. */
  exponent: number;
  symbol: string;
  /** Alphabetic symbols read better with a space: "Rp 25.000", but "$25". */
  spaced: boolean;
}

const CURRENCIES = {
  IDR: { exponent: 0, symbol: "Rp", spaced: true },
  USD: { exponent: 2, symbol: "$", spaced: false },
  EUR: { exponent: 2, symbol: "€", spaced: false },
  GBP: { exponent: 2, symbol: "£", spaced: false },
  JPY: { exponent: 0, symbol: "¥", spaced: false },
  SGD: { exponent: 2, symbol: "S$", spaced: false },
  AUD: { exponent: 2, symbol: "A$", spaced: false },
  MYR: { exponent: 2, symbol: "RM", spaced: true },
} as const satisfies Record<string, CurrencyInfo>;

export type CurrencyCode = keyof typeof CURRENCIES;
export const currencyCodes = Object.keys(CURRENCIES) as CurrencyCode[];

const SEPARATORS: Record<NumberFormat, { thousands: string; decimal: string }> = {
  "dot-comma": { thousands: ".", decimal: "," },
  "comma-dot": { thousands: ",", decimal: "." },
};

export interface MoneyFormatOptions {
  numberFormat: NumberFormat;
}

/** `amount` is whole minor units of `currency`. Built on Dinero.js; never touches `Intl`. */
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  { numberFormat }: MoneyFormatOptions,
): string {
  const info: CurrencyInfo | undefined = Object.hasOwn(CURRENCIES, currency)
    ? CURRENCIES[currency]
    : undefined;
  if (info === undefined) throw new Error(`Unsupported currency "${currency}"`);
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Amount must be whole minor units, got ${amount}`);
  }

  const money = dinero({
    amount,
    currency: { code: currency, base: 10, exponent: info.exponent },
  });
  const plain = toDecimal(money, ({ value }) => value);
  const negative = plain.startsWith("-");
  const [whole = "0", fraction] = plain.replace("-", "").split(".");
  const { thousands, decimal } = SEPARATORS[numberFormat];
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, thousands);
  const number = fraction === undefined ? grouped : `${grouped}${decimal}${fraction}`;
  return `${negative ? "-" : ""}${info.symbol}${info.spaced ? " " : ""}${number}`;
}

/**
 * Reads an amount the user typed, in the chosen separator style, into whole minor units of
 * `currency`. Returns `undefined` for anything that is not exactly an amount, including more
 * decimals than the currency has.
 */
export function parseMoney(
  text: string,
  currency: CurrencyCode,
  { numberFormat }: MoneyFormatOptions,
): number | undefined {
  const info: CurrencyInfo | undefined = Object.hasOwn(CURRENCIES, currency)
    ? CURRENCIES[currency]
    : undefined;
  if (info === undefined) throw new Error(`Unsupported currency "${currency}"`);
  const { thousands, decimal } = SEPARATORS[numberFormat];
  const escape = (c: string) => `\\${c}`;
  const pattern = new RegExp(
    `^(-?)(\\d{1,3}(?:${escape(thousands)}\\d{3})+|\\d+)(?:${escape(decimal)}(\\d+))?$`,
  );
  const match = pattern.exec(text.trim());
  if (match === null) return undefined;
  const [, sign = "", whole = "", fraction = ""] = match;
  if (fraction.length > info.exponent) return undefined;
  const digits = whole.split(thousands).join("") + fraction.padEnd(info.exponent, "0");
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return undefined;
  return sign === "-" && value !== 0 ? -value : value;
}

const DATE_LOCALES = { id, en: enUS };

/** A plain `YYYY-MM-DD` date as "18 Okt 2026" / "18 Oct 2026". No time zone is involved. */
export function formatDate(date: string, language: Language): string {
  assertDate(date);
  return format(parse(date, "yyyy-MM-dd", new Date(0)), "d MMM yyyy", {
    locale: DATE_LOCALES[language],
  });
}
