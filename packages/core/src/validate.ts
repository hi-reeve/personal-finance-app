import { isValid, parse } from "date-fns";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A plain calendar date `YYYY-MM-DD` that exists. No time zone is involved. */
export function assertDate(value: string): void {
  if (!DATE.test(value) || !isValid(parse(value, "yyyy-MM-dd", new Date(0)))) {
    throw new Error(`Invalid date "${value}": expected a real calendar date as YYYY-MM-DD`);
  }
}

/** A plain time of day `HH:mm`. */
export function assertTime(value: string): void {
  if (!TIME.test(value)) throw new Error(`Invalid time "${value}": expected HH:mm`);
}

/** Money is whole minor units of the Account's currency. */
export function assertAmount(value: number): void {
  if (!Number.isSafeInteger(value))
    throw new Error(`Invalid amount ${value}: expected whole minor units`);
}

export const ACCOUNT_KINDS = ["cash", "bank", "ewallet", "credit-card", "other"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export function assertAccountKind(value: string): void {
  if (!ACCOUNT_KINDS.includes(value as AccountKind)) {
    throw new Error(`Invalid Account kind "${value}": expected one of ${ACCOUNT_KINDS.join(", ")}`);
  }
}
