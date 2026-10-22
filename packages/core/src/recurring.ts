import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDate,
  getDaysInMonth,
  parse,
  setDate,
  startOfMonth,
} from "date-fns";
import type { CurrencyCode } from "./format";

export type RecurringKind = "expense" | "income" | "transfer";
export type RecurringUnit = "day" | "week" | "month" | "year";
export const RECURRING_KINDS: readonly RecurringKind[] = ["expense", "income", "transfer"];
export const RECURRING_UNITS: readonly RecurringUnit[] = ["day", "week", "month", "year"];

/** Every N days, weeks, months or years from a start date, with an optional end. Plain dates. */
export interface Schedule {
  every: number;
  unit: RecurringUnit;
  /** First due date, `YYYY-MM-DD`. A monthly or yearly item keeps this day of the month. */
  start: string;
  /** Months and years: fall on the last day of the month instead of the start's day. */
  lastDay: boolean;
  /** No occurrence after this date. */
  endDate?: string;
  /** No more than this many occurrences, counted from the start. */
  endCount?: number;
}

/** Where an occurrence stands. `paid` and `skipped` are the only ones that are ever stored. */
export type OccurrenceStatus = "upcoming" | "due-soon" | "overdue" | "paid" | "skipped";

/** How many days ahead an unpaid occurrence counts as due soon, when the setting is not chosen. */
export const DEFAULT_DUE_SOON_DAYS = 3;

const DAY = "yyyy-MM-dd";
const MAX_OCCURRENCES = 20_000;
const read = (date: string) => parse(date, DAY, new Date(0));

/** The `index`th due date (0 is the start). A day that a month lacks falls on its last day. */
function dueAt(schedule: Schedule, index: number): string {
  const start = read(schedule.start);
  if (schedule.unit === "day") return format(addDays(start, index * schedule.every), DAY);
  if (schedule.unit === "week") return format(addDays(start, index * schedule.every * 7), DAY);
  const months = index * schedule.every * (schedule.unit === "year" ? 12 : 1);
  const month = addMonths(startOfMonth(start), months);
  const day = schedule.lastDay
    ? getDaysInMonth(month)
    : Math.min(getDate(start), getDaysInMonth(month));
  return format(setDate(month, day), DAY);
}

/** Every due date from `from` to `to`, both included, in order. Computed, never stored. */
export function dueDates(schedule: Schedule, from: string, to: string): string[] {
  const dates: string[] = [];
  for (let index = 0; index < MAX_OCCURRENCES; index++) {
    if (schedule.endCount !== undefined && index >= schedule.endCount) break;
    const due = dueAt(schedule, index);
    if (due > to || (schedule.endDate !== undefined && due > schedule.endDate)) break;
    if (due >= from) dates.push(due);
  }
  return dates;
}

/** Where an occurrence nobody has acted on stands today. Overdue stays overdue until acted on. */
export function openStatus(
  due: string,
  today: string,
  dueSoonDays = DEFAULT_DUE_SOON_DAYS,
): "upcoming" | "due-soon" | "overdue" {
  if (due < today) return "overdue";
  return differenceInCalendarDays(read(due), read(today)) <= dueSoonDays ? "due-soon" : "upcoming";
}

/** Whole days between two plain dates, `b` less `a`. */
export const daysBetween = (a: string, b: string): number =>
  differenceInCalendarDays(read(b), read(a));

/** A price that applies to occurrences due on or after its date. */
export interface PriceChange {
  /** `YYYY-MM-DD`. */
  effective: string;
  /** Positive minor units of the Account's currency. */
  amount: number;
}

/** A template: what is paid, from where, and how often. Occurrences are worked out from it. */
export interface RecurringItem extends Schedule {
  id: string;
  name: string;
  kind: RecurringKind;
  accountId: string;
  /** Transfers only. */
  toAccountId?: string;
  /** Expense and income only; one Category in v1. */
  categoryId?: string;
  /** Positive minor units of the Account's currency (a transfer's amount leaving it). The first
   *  price: use `priceOn` for what an occurrence due on a date is expected to cost. */
  amount: number;
  /** Later prices, oldest first. Occurrences before a change keep the price they had. */
  changes: PriceChange[];
  /** Transfers only, when the other Account is in another currency. Defaults to `amount`. */
  toAmount?: number;
  /** A recurring expense the person pays for a service, counted in the monthly total. */
  subscription: boolean;
  /** No occurrence is due from this date until `pausedUntil` (or for good, without one). */
  pausedFrom?: string;
  /** The day paying starts again; occurrences due before it stay out of the way. */
  pausedUntil?: string;
  createdAt: number;
}

export type NewRecurring = Omit<
  RecurringItem,
  "id" | "createdAt" | "lastDay" | "subscription" | "changes" | "pausedFrom" | "pausedUntil"
> & {
  lastDay?: boolean;
  subscription?: boolean;
};

/** `null` removes an optional value. Changes apply to future occurrences only. */
export type RecurringPatch = Partial<
  Omit<NewRecurring, "endDate" | "endCount" | "toAmount" | "categoryId" | "toAccountId">
> & {
  endDate?: string | null;
  endCount?: number | null;
  toAmount?: number | null;
  categoryId?: string | null;
  toAccountId?: string | null;
};

/** One due date of an item. Only a paid or skipped one is ever stored. */
export interface Occurrence {
  /** Deterministic from the item and the due date, so devices agree on it. */
  id: string;
  itemId: string;
  name: string;
  kind: RecurringKind;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  due: string;
  status: OccurrenceStatus;
  /** What the item said to pay, kept as it was when this occurrence was paid or skipped. */
  expected: number;
  /** What the linked Transaction or Transfer moved out of the Account. */
  paid?: number;
  /** `expected` less `paid`: positive when less was paid. */
  difference?: number;
  transactionId?: string;
  transferId?: string;
}

export interface OccurrenceQuery {
  /** Absent: only occurrences nobody acted on, from each item's start. Given: every state. */
  from?: string;
  to: string;
  /** The device's calendar day; nothing in core knows the time zone. */
  today: string;
  dueSoonDays?: number;
}

export interface MarkPaidOptions {
  /** What was really paid, if not the expected amount. */
  amount?: number;
  /** Transfers: what arrived, when the Accounts differ in currency. */
  toAmount?: number;
  /** The day it was paid, if not the due date. */
  date?: string;
  /** Required for an Account not in the base currency. */
  rate?: string;
  note?: string;
}

export const occurrenceId = (itemId: string, due: string) => `occ-${itemId}-${due}`;

/** What an occurrence due on `date` is expected to cost: the latest price in force that day. */
export function priceOn(item: Pick<RecurringItem, "amount" | "changes">, date: string): number {
  let amount = item.amount;
  for (const change of item.changes) if (change.effective <= date) amount = change.amount;
  return amount;
}

/** Whether nothing is due on `date` because the item is paused. */
export const isPausedOn = (
  item: Pick<RecurringItem, "pausedFrom" | "pausedUntil">,
  date: string,
): boolean =>
  item.pausedFrom !== undefined &&
  item.pausedFrom <= date &&
  (item.pausedUntil === undefined || date < item.pausedUntil);

/** The last due date of an item that ends, or `undefined` for one that goes on for ever. */
export function lastDue(schedule: Schedule): string | undefined {
  if (schedule.endDate === undefined && schedule.endCount === undefined) return undefined;
  return dueDates(schedule, schedule.start, schedule.endDate ?? "9999-12-31").at(-1);
}

/** What one payment costs per month, rounded to a minor unit: weekly and daily go by the year. */
export function monthlyEquivalent(amount: number, every: number, unit: RecurringUnit): number {
  // Exact integer maths: amount × payments per year ÷ 12, with payments per year as a fraction.
  const [numerator, denominator] =
    unit === "day"
      ? [365n, 12n]
      : unit === "week"
        ? [365n, 84n]
        : unit === "month"
          ? [12n, 12n]
          : [1n, 12n];
  const top = BigInt(amount) * numerator;
  const bottom = denominator * BigInt(every);
  return Number((top * 2n + bottom) / (bottom * 2n));
}

/** A subscription as it stands on a day. */
export interface SubscriptionEntry {
  itemId: string;
  name: string;
  accountId: string;
  currency: CurrencyCode;
  /** The price in force that day, per payment. */
  price: number;
  every: number;
  unit: RecurringUnit;
  /** `price` as a month: what it adds to the monthly total. */
  monthly: number;
  /** Only an active one is in the total. */
  status: "active" | "paused" | "ended";
}

export interface SubscriptionSummary {
  subscriptions: SubscriptionEntry[];
  /** The monthly total of the active ones, one per currency: nothing is converted here. */
  monthly: { currency: CurrencyCode; amount: number }[];
}
