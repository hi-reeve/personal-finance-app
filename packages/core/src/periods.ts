import { addDays, addMonths, endOfMonth, format, parse, startOfMonth } from "date-fns";
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
