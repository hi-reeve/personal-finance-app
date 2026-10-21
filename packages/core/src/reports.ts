import type { Category, CategoryKind, Transaction } from "./engine";
import type { CurrencyCode } from "./format";
import { daysIn, monthOf, shiftMonth } from "./periods";
import { convertMinor } from "./rates";

export interface SpendingQuery {
  /** Plain dates `YYYY-MM-DD`, both included. */
  from: string;
  to: string;
  /** What to total: `expense` (default) or `income`. */
  kind?: CategoryKind;
}

export interface CategorySpend {
  categoryId: string;
  /** Absent when the Category no longer exists; see `missing`. */
  name?: string;
  missing?: true;
  /** Base-currency minor units, including everything inside this Category. */
  total: number;
  /** Just the Lines recorded straight into this Category. */
  own: number;
  /** Of the whole report, in basis points (10,000 is 100%). */
  share: number;
  /** The part of `share` that belongs to `own`; the rest is split among the children. */
  ownShare: number;
  /** Largest first. */
  children: CategorySpend[];
}

export interface SpendingByCategory {
  /** The base currency every figure is in. */
  currency?: CurrencyCode;
  kind: CategoryKind;
  from: string;
  to: string;
  total: number;
  /** Top-level Categories, largest first. They add up to 10,000 basis points of share. */
  categories: CategorySpend[];
  /** Lines left out because no rate could convert them. */
  skipped: { lines: number };
}

export interface SpendingInput extends SpendingQuery {
  base: CurrencyCode | undefined;
  transactions: readonly Transaction[];
  /** The currency each Account is in, by id. */
  accountCurrency: ReadonlyMap<string, CurrencyCode>;
  categories: readonly Category[];
  /** Categories that are never counted, such as the Balance adjustment Category. */
  excluded: ReadonlySet<string>;
}

/**
 * Splits `amount` among `weights` in proportion, in whole units, by largest remainder: the parts
 * always add up to exactly `amount`. Negative weights count as nothing. Used for shares in basis
 * points, so a donut never leaves a gap or overshoots.
 */
function allocate(amount: number, weights: readonly number[]): number[] {
  const clamped = weights.map((weight) => BigInt(Math.max(weight, 0)));
  const whole = clamped.reduce((sum, weight) => sum + weight, 0n);
  if (whole === 0n || amount <= 0) return weights.map(() => 0);
  const scaled = clamped.map((weight) => weight * BigInt(amount));
  const parts = scaled.map((value) => value / whole);
  let left = BigInt(amount) - parts.reduce((sum, part) => sum + part, 0n);
  const order = scaled
    .map((value, index) => ({ index, remainder: value % whole }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { index } of order) {
    if (left <= 0n) break;
    parts[index] = (parts[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return parts.map(Number);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** One Line that counts, in the base currency, positive when it adds to the report's kind. */
interface CountedLine {
  date: string;
  categoryId: string;
  value: number;
}

/**
 * The counting rules shared by every report: which Lines count, and what each is worth in the base
 * currency at its Transaction's frozen rate. A Line that cannot be converted is counted, not summed.
 */
function countLines(
  input: SpendingInput,
  kind: CategoryKind,
  base: CurrencyCode,
  known: ReadonlyMap<string, Category>,
): { lines: CountedLine[]; skipped: number } {
  const lines: CountedLine[] = [];
  let skipped = 0;
  for (const tx of input.transactions) {
    if (tx.date < input.from || tx.date > input.to) continue;
    const currency = input.accountCurrency.get(tx.accountId);
    for (const line of tx.lines) {
      if (input.excluded.has(line.categoryId)) continue;
      // A Line whose Category is gone counts by the way the money moved.
      const lineKind = known.get(line.categoryId)?.kind ?? (line.amount < 0 ? "expense" : "income");
      if (lineKind !== kind) continue;
      let amount: number | undefined;
      if (currency === base) amount = line.amount;
      else if (currency !== undefined && tx.rate !== undefined) {
        try {
          amount = convertMinor(line.amount, tx.rate, currency, base);
        } catch {
          // A rate or amount that cannot be converted is counted, not allowed to sink the report.
        }
      }
      if (amount === undefined) {
        skipped += 1;
        continue;
      }
      lines.push({
        date: tx.date,
        categoryId: line.categoryId,
        value: kind === "expense" ? -amount : amount,
      });
    }
  }
  return { lines, skipped };
}

/**
 * The counting rules in one place, "as recorded": every Line counts under its own Category at the
 * rate frozen with its Transaction, so a past period never moves. Only income and expense Lines
 * count. Transfers are not Transactions and never appear; their fee is spending and does. The
 * Balance adjustment Category is left out. A refund reduces its Category.
 */
export function spendingByCategory(input: SpendingInput): SpendingByCategory {
  const kind = input.kind ?? "expense";
  const { base, from, to } = input;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to)
    throw new Error(`Invalid period ${from} to ${to}: expected YYYY-MM-DD dates, earliest first`);
  const result: SpendingByCategory = {
    ...(base !== undefined ? { currency: base } : {}),
    kind,
    from,
    to,
    total: 0,
    categories: [],
    skipped: { lines: 0 },
  };
  if (base === undefined) return result;

  const known = new Map(input.categories.map((c) => [c.id, c]));
  const counted = countLines(input, kind, base, known);
  result.skipped.lines = counted.skipped;
  const figures = new Map<string, number>();
  for (const line of counted.lines)
    figures.set(line.categoryId, (figures.get(line.categoryId) ?? 0) + line.value);

  const childrenOf = new Map<string | undefined, string[]>();
  for (const id of figures.keys()) if (!known.has(id)) push(childrenOf, undefined, id);
  for (const c of input.categories) {
    if (c.kind !== kind) continue;
    // A Category whose parent is gone, or of the other kind, is shown at the top so no figure
    // falls out of the total.
    const parent =
      c.parentId !== undefined && known.get(c.parentId)?.kind === kind ? c.parentId : undefined;
    push(childrenOf, parent, c.id);
  }

  // Largest first; ties by name, then id, so every device lists them the same way.
  const ranked = (nodes: CategorySpend[]) =>
    nodes.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      const names =
        (a.name ?? "") === (b.name ?? "") ? 0 : (a.name ?? "") < (b.name ?? "") ? -1 : 1;
      return names !== 0 ? names : a.categoryId < b.categoryId ? -1 : 1;
    });

  // Every Category with a figure, and every parent that leads to one.
  const build = (id: string): CategorySpend | undefined => {
    const children = ranked(
      (childrenOf.get(id) ?? [])
        .map(build)
        .filter((child): child is CategorySpend => child !== undefined),
    );
    const mine = figures.get(id);
    if (mine === undefined && children.length === 0) return undefined;
    const category = known.get(id);
    return {
      categoryId: id,
      ...(category !== undefined ? { name: category.name } : { missing: true as const }),
      total: (mine ?? 0) + children.reduce((sum, child) => sum + child.total, 0),
      own: mine ?? 0,
      share: 0,
      ownShare: 0,
      children,
    };
  };
  const tops = ranked(
    (childrenOf.get(undefined) ?? [])
      .map(build)
      .filter((node): node is CategorySpend => node !== undefined),
  );

  // Shares of what was actually spent, level by level: a node's share is split among its children
  // and its own Lines, so children never show more than their parent and the top adds to 100%.
  // A Category whose refunds outweigh its spending has no share.
  const give = (nodes: CategorySpend[], amount: number) => {
    const parts = allocate(
      amount,
      nodes.map((node) => node.total),
    );
    nodes.forEach((node, index) => {
      node.share = parts[index] ?? 0;
    });
  };
  const descend = (node: CategorySpend) => {
    const parts = allocate(node.share, [...node.children.map((child) => child.total), node.own]);
    node.children.forEach((child, index) => {
      child.share = parts[index] ?? 0;
      descend(child);
    });
    node.ownShare = parts[node.children.length] ?? 0;
  };
  give(tops, 10_000);
  tops.forEach(descend);

  result.total = tops.reduce((sum, node) => sum + node.total, 0);
  result.categories = tops;
  return result;
}

export interface DailyTotals {
  currency?: CurrencyCode;
  kind: CategoryKind;
  from: string;
  to: string;
  total: number;
  /** Every day of the period in order; a day with nothing is zero. Empty before setup. */
  days: { date: string; total: number }[];
  skipped: { lines: number };
}

/** What was spent (or earned) each day, under the same counting rules as the by-Category report. */
export function dailyTotals(input: SpendingInput): DailyTotals {
  const kind = input.kind ?? "expense";
  const { base, from, to } = input;
  const dates = daysIn({ from, to });
  const empty: DailyTotals = {
    ...(base !== undefined ? { currency: base } : {}),
    kind,
    from,
    to,
    total: 0,
    days: [],
    skipped: { lines: 0 },
  };
  if (base === undefined) return empty;
  const known = new Map(input.categories.map((c) => [c.id, c]));
  const counted = countLines(input, kind, base, known);
  const perDay = new Map<string, number>();
  for (const line of counted.lines)
    perDay.set(line.date, (perDay.get(line.date) ?? 0) + line.value);
  const days = dates.map((date) => ({ date, total: perDay.get(date) ?? 0 }));
  return {
    ...empty,
    total: days.reduce((sum, day) => sum + day.total, 0),
    days,
    skipped: { lines: counted.skipped },
  };
}

export interface MonthlyTotal {
  /** `YYYY-MM`. */
  month: string;
  /** The whole calendar month, even when the range only covers part of it. */
  from: string;
  to: string;
  /** Base-currency minor units; both are positive amounts. */
  income: number;
  expense: number;
}

export interface MonthlyTotals {
  currency?: CurrencyCode;
  from: string;
  to: string;
  /** Every month the range touches, oldest first. Empty before setup. */
  months: MonthlyTotal[];
  skipped: { lines: number };
}

/** Income and spending for each month in the range, under the same counting rules as every report. */
export function monthlyTotals(input: Omit<SpendingInput, "kind">): MonthlyTotals {
  const { base, from, to } = input;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to)
    throw new Error(`Invalid period ${from} to ${to}: expected YYYY-MM-DD dates, earliest first`);
  const result: MonthlyTotals = {
    ...(base !== undefined ? { currency: base } : {}),
    from,
    to,
    months: [],
    skipped: { lines: 0 },
  };
  if (base === undefined) return result;

  const known = new Map(input.categories.map((c) => [c.id, c]));
  const totals = new Map<string, { income: number; expense: number }>();
  for (const kind of ["income", "expense"] as const) {
    const counted = countLines({ ...input, kind }, kind, base, known);
    // Each Line is looked at under its own kind only, so none is counted twice.
    result.skipped.lines += counted.skipped;
    for (const line of counted.lines) {
      const key = line.date.slice(0, 7);
      const month = totals.get(key) ?? { income: 0, expense: 0 };
      month[kind] += line.value;
      totals.set(key, month);
    }
  }
  for (let month = monthOf(from); month.from <= to; month = shiftMonth(month, 1)) {
    const key = month.from.slice(0, 7);
    result.months.push({ month: key, ...month, ...(totals.get(key) ?? { income: 0, expense: 0 }) });
  }
  return result;
}
