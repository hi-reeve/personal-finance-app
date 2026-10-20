import { describe, expect, it } from "vite-plus/test";
import {
  convertMinor,
  createRateProvider,
  currencyApiFetcher,
  frankfurterFetcher,
  normalizeRate,
  type RateFetcher,
} from "./index";

describe("normalizeRate", () => {
  it("accepts a plain positive decimal and tidies it", () => {
    expect(normalizeRate("16250.5")).toBe("16250.5");
    expect(normalizeRate(" 0.000061 ")).toBe("0.000061");
    expect(normalizeRate("16250.500")).toBe("16250.5");
    expect(normalizeRate("0016250")).toBe("16250");
    expect(normalizeRate("1.")).toBe("1");
  });

  it("rejects what is not a usable rate", () => {
    for (const bad of ["", "abc", "0", "0.0", "-1", "1e3", "1,5", "1.2.3", ".", "Infinity"]) {
      expect(normalizeRate(bad), bad).toBeUndefined();
    }
    expect(normalizeRate("0.0000000000001")).toBeUndefined(); // more than 12 decimals
  });
});

describe("convertMinor", () => {
  it("converts between currencies with different minor units", () => {
    // USD 12.00 at 16,250.5 IDR per USD = Rp 195,006
    expect(convertMinor(1_200, "16250.5", "USD", "IDR")).toBe(195_006);
    // Rp 195,006 back at 0.0000615 USD per IDR = $11.99 (rounded to cents)
    expect(convertMinor(195_006, "0.0000615", "IDR", "USD")).toBe(1_199);
    // JPY has no minor unit: ¥1,500 at 0.0067 USD = $10.05
    expect(convertMinor(1_500, "0.0067", "JPY", "USD")).toBe(1_005);
    expect(convertMinor(1_000, "1", "USD", "USD")).toBe(1_000);
  });

  it("rounds half away from zero, so a refund mirrors the purchase", () => {
    // 5 cents * 0.5 = 2.5 cents
    expect(convertMinor(5, "0.5", "USD", "EUR")).toBe(3);
    expect(convertMinor(-5, "0.5", "USD", "EUR")).toBe(-3);
    expect(convertMinor(0, "123", "USD", "IDR")).toBe(0);
  });

  it("is exact for large amounts", () => {
    expect(convertMinor(9_000_000_000, "0.0000615", "IDR", "USD")).toBe(55_350_000);
    expect(convertMinor(Number.MAX_SAFE_INTEGER, "1", "IDR", "IDR")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects a bad rate or a result that does not fit", () => {
    expect(() => convertMinor(1, "nope", "USD", "IDR")).toThrow();
    expect(() => convertMinor(Number.MAX_SAFE_INTEGER, "1000", "USD", "IDR")).toThrow();
  });
});

function memoryCache() {
  const map = new Map<string, string>();
  return { map, get: (k: string) => map.get(k), set: (k: string, v: string) => void map.set(k, v) };
}

describe("rate provider", () => {
  const ok =
    (rate: string): RateFetcher =>
    async () =>
      rate;
  const none: RateFetcher = async () => undefined;
  const boom: RateFetcher = async () => {
    throw new Error("offline");
  };

  it("needs no network for the same currency", async () => {
    const provider = createRateProvider({ cache: memoryCache(), fetchers: [boom] });
    expect(await provider.lookup("2026-10-19", "IDR", "IDR")).toEqual({
      rate: "1",
      source: "same",
    });
  });

  it("asks the first source, then remembers the answer on this device", async () => {
    const cache = memoryCache();
    let calls = 0;
    const provider = createRateProvider({
      cache,
      fetchers: [
        async () => {
          calls += 1;
          return "16250.5";
        },
      ],
    });
    expect(await provider.lookup("2026-10-19", "USD", "IDR")).toEqual({
      rate: "16250.5",
      source: "network",
    });
    expect(await provider.lookup("2026-10-19", "USD", "IDR")).toEqual({
      rate: "16250.5",
      source: "cache",
    });
    expect(calls).toBe(1);
    // A different day is a different question.
    await provider.lookup("2026-10-18", "USD", "IDR");
    expect(calls).toBe(2);
  });

  it("falls through a failing or empty source to the next, and never throws", async () => {
    const provider = createRateProvider({
      cache: memoryCache(),
      fetchers: [boom, none, ok("0.0000615")],
    });
    expect(await provider.lookup("2026-10-19", "IDR", "USD")).toMatchObject({ rate: "0.0000615" });

    const offline = createRateProvider({ cache: memoryCache(), fetchers: [boom, none] });
    expect(await offline.lookup("2026-10-19", "USD", "IDR")).toBeUndefined();
  });

  it("ignores a source that answers with nonsense", async () => {
    const provider = createRateProvider({
      cache: memoryCache(),
      fetchers: [ok("not a number"), ok("3.5")],
    });
    expect(await provider.lookup("2026-10-19", "USD", "EUR")).toMatchObject({ rate: "3.5" });
  });

  it("does not remember a miss, so a later try can succeed", async () => {
    const cache = memoryCache();
    let up = false;
    const provider = createRateProvider({
      cache,
      fetchers: [async () => (up ? "2" : undefined)],
    });
    expect(await provider.lookup("2026-10-19", "USD", "EUR")).toBeUndefined();
    up = true;
    expect(await provider.lookup("2026-10-19", "USD", "EUR")).toMatchObject({ rate: "2" });
  });
});

describe("rate sources", () => {
  it("Frankfurter: asks for one day and one currency, and reads the rate", async () => {
    const urls: string[] = [];
    const fetcher = frankfurterFetcher(async (url) => {
      urls.push(url);
      return { base: "USD", date: "2026-10-16", rates: { IDR: 16250.5 } };
    });
    expect(await fetcher("2026-10-18", "USD", "IDR")).toBe("16250.5");
    expect(urls).toEqual(["https://api.frankfurter.dev/v1/2026-10-18?base=USD&symbols=IDR"]);
  });

  it("both sources refuse a date that is not a plain calendar date, so nothing odd reaches a URL", async () => {
    let asked = 0;
    const getJson = async () => {
      asked += 1;
      return {};
    };
    for (const fetcher of [frankfurterFetcher(getJson), currencyApiFetcher(getJson)])
      expect(await fetcher("../x?y=1", "USD", "IDR")).toBeUndefined();
    expect(asked).toBe(0);
  });

  it("Frankfurter: a currency it does not list is a miss, not a crash", async () => {
    const fetcher = frankfurterFetcher(async () => ({ rates: {} }));
    expect(await fetcher("2026-10-18", "USD", "XXX" as never)).toBeUndefined();
    expect(await frankfurterFetcher(async () => "garbage")("2026-10-18", "USD", "IDR")).toBe(
      undefined,
    );
  });

  it("fallback source: reads the rate for the day from the currency list", async () => {
    const urls: string[] = [];
    const fetcher = currencyApiFetcher(async (url) => {
      urls.push(url);
      return { date: "2026-10-18", usd: { idr: 16250.5, eur: 0.92 } };
    });
    expect(await fetcher("2026-10-18", "USD", "IDR")).toBe("16250.5");
    expect(urls).toEqual([
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-18/v1/currencies/usd.json",
    ]);
    expect(await fetcher("2026-10-18", "USD", "GBP")).toBeUndefined();
  });

  it("writes tiny rates without scientific notation", async () => {
    const fetcher = currencyApiFetcher(async () => ({ idr: { usd: 6.15e-5 } }));
    expect(await fetcher("2026-10-18", "IDR", "USD")).toBe("0.0000615");
  });
});
