import {
  addDays,
  addMonths,
  endOfMonth,
  endOfYear,
  format,
  getDate,
  parse,
  setDate,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from "date-fns";
import { assertDate } from "./validate";

/** Two plain dates `YYYY-MM-DD`, both included. */
export interface Period {
  from: string;
  to: string;
}

const DAY = "yyyy-MM-dd";
const MAX_DAYS = 3_700;

const read = (date: string) => {
  assertDate(date);
  return parse(date, DAY, new Date(0));
};

/** The calendar month around `date`. No time zone is involved. */
export function monthOf(date: string): Period {
  const day = read(date);
  return { from: format(startOfMonth(day), DAY), to: format(endOfMonth(day), DAY) };
}

/**
 * The budget period around `date`. A month runs from `startDay` (1 to 28, so every month has it) to
 * the day before the next one; a week runs Monday to Sunday; a year is the calendar year.
 */
export function budgetPeriodOf(
  date: string,
  kind: "month" | "week" | "year",
  startDay = 1,
): Period {
  const day = read(date);
  if (kind === "week") {
    const from = startOfWeek(day, { weekStartsOn: 1 });
    return { from: format(from, DAY), to: format(addDays(from, 6), DAY) };
  }
  if (kind === "year")
    return { from: format(startOfYear(day), DAY), to: format(endOfYear(day), DAY) };
  const month = getDate(day) >= startDay ? startOfMonth(day) : startOfMonth(subMonths(day, 1));
  const from = setDate(month, startDay);
  return { from: format(from, DAY), to: format(addDays(addMonths(from, 1), -1), DAY) };
}

/** The day after a plain date. */
export const dayAfter = (date: string): string => format(addDays(read(date), 1), DAY);

/** The month `months` away from a month Period (negative goes back). */
export function shiftMonth(period: Period, months: number): Period {
  return monthOf(format(addMonths(read(period.from), months), DAY));
}

/** Every day of a Period in order. Refuses a backwards period and anything over about ten years. */
export function daysIn(period: Period): string[] {
  const start = read(period.from);
  const end = read(period.to);
  if (start > end) throw new Error(`Invalid period ${period.from} to ${period.to}`);
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    if (days.length >= MAX_DAYS) throw new Error("The period is too long");
    days.push(format(day, DAY));
  }
  return days;
}
