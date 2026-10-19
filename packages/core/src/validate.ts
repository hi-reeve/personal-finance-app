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

export const ACCOUNT_ICONS = ["wallet", "bank", "phone", "card", "piggy", "briefcase"] as const;
export type AccountIcon = (typeof ACCOUNT_ICONS)[number];

/** Colours are the app's accent names, so an Account takes the theme's matching shade. */
export const ACCOUNT_COLORS = ["terracotta", "brown", "teal", "slate", "sage", "plum"] as const;
export type AccountColor = (typeof ACCOUNT_COLORS)[number];

export function assertAccountIcon(value: string): void {
  if (!ACCOUNT_ICONS.includes(value as AccountIcon))
    throw new Error(`Invalid Account icon "${value}": expected one of ${ACCOUNT_ICONS.join(", ")}`);
}

export function assertAccountColor(value: string): void {
  if (!ACCOUNT_COLORS.includes(value as AccountColor))
    throw new Error(
      `Invalid Account colour "${value}": expected one of ${ACCOUNT_COLORS.join(", ")}`,
    );
}
