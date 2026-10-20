import {
  createRateProvider,
  currencyApiFetcher,
  frankfurterFetcher,
  type GetJson,
  type RateCacheStore,
} from "@pfa/core";

const PREFIX = "pfa.rate:";

/** Rates already fetched, kept in this browser only: never part of the synced data. */
const cache: RateCacheStore = {
  get(key) {
    try {
      return localStorage.getItem(PREFIX + key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {
      // Storage is full or blocked: the rate is simply fetched again next time.
    }
  },
};

const getJson: GetJson = async (url) => {
  // Only the day and the two currencies are asked; no cookies and no referrer go with it.
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`Rate source answered ${response.status}`);
  return response.json();
};

/** Frankfurter first, a second free source if it has no answer. Offline simply finds nothing. */
export const rateProvider = createRateProvider({
  cache,
  fetchers: [frankfurterFetcher(getJson), currencyApiFetcher(getJson)],
});
