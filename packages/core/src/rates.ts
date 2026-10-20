import { currencyExponent, type CurrencyCode } from "./format";

const MAX_FRACTION_DIGITS = 12;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A rate is plain decimal text so no float ever touches money: how many units of the second
 * currency one whole unit of the first buys. Returns the tidy form, or `undefined` for anything
 * that is not a positive decimal with at most 12 digits after the point.
 */
export function normalizeRate(text: string): string | undefined {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(text.trim());
  if (match === null) return undefined;
  const whole = (match[1] ?? "").replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > MAX_FRACTION_DIGITS) return undefined;
  if (/^0*$/.test(whole) && fraction === "") return undefined;
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

function parts(rate: string): { numerator: bigint; denominator: bigint } {
  const tidy = normalizeRate(rate);
  if (tidy === undefined) throw new Error(`Invalid rate "${rate}"`);
  const [whole = "0", fraction = ""] = tidy.split(".");
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}

/**
 * Converts whole minor units of `from` into whole minor units of `to` at `rate`, rounding half
 * away from zero so a refund mirrors the purchase it undoes. Exact: it uses integer maths.
 */
export function convertMinor(
  amount: number,
  rate: string,
  from: CurrencyCode,
  to: CurrencyCode,
): number {
  if (!Number.isSafeInteger(amount))
    throw new Error(`Amount must be whole minor units, got ${amount}`);
  const { numerator, denominator } = parts(rate);
  const top =
    BigInt(amount < 0 ? -amount : amount) * numerator * 10n ** BigInt(currencyExponent(to));
  const bottom = denominator * 10n ** BigInt(currencyExponent(from));
  const rounded = (2n * top + bottom) / (2n * bottom);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("The converted amount is too large");
  const value = Number(rounded);
  return amount < 0 && value !== 0 ? -value : value;
}

/** Device-local memory for rates already fetched. Never synced. */
export interface RateCacheStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

/** Looks up one rate from one source, or returns nothing. May throw when offline. */
export type RateFetcher = (
  date: string,
  from: CurrencyCode,
  to: CurrencyCode,
) => Promise<string | undefined>;

export interface RateLookup {
  rate: string;
  /** `same` when both currencies are the same and no lookup was needed. */
  source: "same" | "cache" | "network";
}

export interface RateProvider {
  /**
   * The rate for a day. Tries this device's memory, then each source in turn. Never throws and
   * never blocks the user: if nothing answers it returns `undefined` and the user types a rate.
   */
  lookup(date: string, from: CurrencyCode, to: CurrencyCode): Promise<RateLookup | undefined>;
}

export function createRateProvider(options: {
  cache: RateCacheStore;
  fetchers: readonly RateFetcher[];
}): RateProvider {
  const { cache, fetchers } = options;
  return {
    async lookup(date, from, to) {
      if (from === to) return { rate: "1", source: "same" };
      const key = `${date}:${from}:${to}`;
      const known = cache.get(key);
      const remembered = known === undefined ? undefined : normalizeRate(known);
      if (remembered !== undefined) return { rate: remembered, source: "cache" };
      for (const fetcher of fetchers) {
        try {
          const found = await fetcher(date, from, to);
          const rate = found === undefined ? undefined : normalizeRate(found);
          if (rate === undefined) continue;
          cache.set(key, rate);
          return { rate, source: "network" };
        } catch {
          // Offline or the source is down: try the next one.
        }
      }
      return undefined;
    },
  };
}

/** Reads JSON from a URL. The platform supplies it; core never touches the network itself. */
export type GetJson = (url: string) => Promise<unknown>;

function asRate(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return normalizeRate(value.toFixed(MAX_FRACTION_DIGITS));
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** Frankfurter (European Central Bank rates). Answers for the latest business day on or before the date. */
export function frankfurterFetcher(getJson: GetJson): RateFetcher {
  return async (date, from, to) => {
    if (!ISO_DATE.test(date)) return undefined;
    const body = await getJson(`https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`);
    return asRate(field(field(body, "rates"), to));
  };
}

/** A second, free source that keeps a file per day. Used when Frankfurter has no answer. */
export function currencyApiFetcher(getJson: GetJson): RateFetcher {
  return async (date, from, to) => {
    if (!ISO_DATE.test(date)) return undefined;
    const base = from.toLowerCase();
    const body = await getJson(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${base}.json`,
    );
    return asRate(field(field(body, base), to.toLowerCase()));
  };
}
