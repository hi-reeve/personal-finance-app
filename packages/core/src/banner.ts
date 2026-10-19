const DAY_MS = 24 * 60 * 60 * 1000;

const STRONG_AFTER_TRANSACTIONS = 10;
const FULL_AFTER_TRANSACTIONS = 25;
const FULL_AFTER_MS = 7 * DAY_MS;

/** `full` is a full-screen prompt; the others are a strip at the top of the app. */
export type BannerLevel = "none" | "gentle" | "strong" | "full";

export interface BannerInput {
  syncOn: boolean;
  /** Epoch ms when setup finished. */
  setupAt: number;
  now: number;
  /** Live Transactions on this device. */
  transactions: number;
  /** Epoch ms until which the full-screen prompt stays out of the way. Device-local. */
  dismissedUntil?: number;
}

/**
 * How loudly to say "your data is only on this device". It escalates with use and never locks anyone
 * out: dismissing the full-screen prompt for a day drops it to the strong banner, not to nothing.
 */
export function localOnlyBanner(input: BannerInput): BannerLevel {
  if (input.syncOn) return "none";
  const heavy =
    input.transactions >= FULL_AFTER_TRANSACTIONS || input.now - input.setupAt >= FULL_AFTER_MS;
  if (heavy) {
    const dismissed = input.dismissedUntil !== undefined && input.now < input.dismissedUntil;
    return dismissed ? "strong" : "full";
  }
  return input.transactions >= STRONG_AFTER_TRANSACTIONS ? "strong" : "gentle";
}

/** Where `dismissedUntil` should point after the user dismisses the full-screen prompt. */
export function dismissFullBannerUntil(now: number): number {
  return now + DAY_MS;
}
