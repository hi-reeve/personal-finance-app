import type { Category, CategoryKind, Transaction } from "./engine";
import type { CurrencyCode } from "./format";
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
 * Shares in basis points that add up to exactly 10,000 (largest remainder), so a donut chart
 * never leaves a gap or overshoots.
 */
function shares(totals: readonly number[], whole: number): number[] {
  if (whole <= 0) return totals.map(() => 0);
  const scaled = totals.map((total) => BigInt(Math.max(total, 0)) * 10_000n);
  const bottom = BigInt(whole);
  const floors = scaled.map((value) => value / bottom);
  let left = 10_000n - floors.reduce((sum, value) => sum + value, 0n);
  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value % bottom }))
    .sort((a, b) =>
      a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
    );
  for (const { index } of byRemainder) {
    if (left <= 0n) break;
    floors[index] = (floors[index] ?? 0n) + 1n;
    left -= 1n;
  }
  return floors.map(Number);
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
  const own = new Map<string, number>();
  for (const tx of input.transactions) {
    if (tx.date < from || tx.date > to) continue;
    const currency = input.accountCurrency.get(tx.accountId);
    for (const line of tx.lines) {
      if (input.excluded.has(line.categoryId)) continue;
      // A Line whose Category is gone counts by the way the money moved.
      const lineKind = known.get(line.categoryId)?.kind ?? (line.amount < 0 ? "expense" : "income");
      if (lineKind !== kind) continue;
      let amount: number;
      if (currency === base) amount = line.amount;
      else if (currency !== undefined && tx.rate !== undefined)
        amount = convertMinor(line.amount, tx.rate, currency, base);
      else {
        result.skipped.lines += 1;
        continue;
      }
      own.set(
        line.categoryId,
        (own.get(line.categoryId) ?? 0) + (kind === "expense" ? -amount : amount),
      );
    }
  }

  const childrenOf = new Map<string | undefined, string[]>();
  for (const id of own.keys())
    if (!known.has(id)) childrenOf.set(undefined, [...(childrenOf.get(undefined) ?? []), id]);
  for (const c of input.categories) {
    if (c.kind !== kind) continue;
    childrenOf.set(c.parentId, [...(childrenOf.get(c.parentId) ?? []), c.id]);
  }

  // Every Category with a figure, and every parent that leads to one.
  const build = (id: string): CategorySpend | undefined => {
    const children = (childrenOf.get(id) ?? [])
      .map(build)
      .filter((child): child is CategorySpend => child !== undefined);
    const mine = own.get(id);
    if (mine === undefined && children.length === 0) return undefined;
    const category = known.get(id);
    return {
      categoryId: id,
      ...(category !== undefined ? { name: category.name } : { missing: true as const }),
      total: (mine ?? 0) + children.reduce((sum, child) => sum + child.total, 0),
      own: mine ?? 0,
      share: 0,
      children,
    };
  };
  const ranked = (nodes: CategorySpend[]) =>
    nodes.sort((a, b) =>
      b.total !== a.total ? b.total - a.total : (a.name ?? "") < (b.name ?? "") ? -1 : 1,
    );
  const tops = ranked(
    (childrenOf.get(undefined) ?? [])
      .map(build)
      .filter((node): node is CategorySpend => node !== undefined),
  );

  const total = tops.reduce((sum, node) => sum + node.total, 0);
  const place = (nodes: CategorySpend[]) => {
    ranked(nodes);
    for (const node of nodes) {
      node.share =
        total > 0
          ? Number((BigInt(Math.max(node.total, 0)) * 10_000n + BigInt(total) / 2n) / BigInt(total))
          : 0;
      place(node.children);
    }
  };
  place(tops);
  // The top level is exact; deeper levels are rounded shares of the same whole.
  const exact = shares(
    tops.map((node) => node.total),
    total,
  );
  tops.forEach((node, index) => (node.share = exact[index] ?? 0));

  result.total = total;
  result.categories = tops;
  return result;
}
