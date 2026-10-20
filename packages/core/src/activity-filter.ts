import type { Category, Transaction, Transfer } from "./engine";

/** One row of Activity: a Transaction or a Transfer. */
export type ActivityEntry =
  | { kind: "transaction"; transaction: Transaction }
  | { kind: "transfer"; transfer: Transfer };

export type ActivityKind = "expense" | "income" | "transfer";

/** Every set field must match. Within a list (Accounts, Categories, Tags) any one may match. */
export interface ActivityFilter {
  /** Matches payee, note and item names, in any case. */
  text?: string;
  /** Plain dates `YYYY-MM-DD`, both ends included. */
  from?: string;
  to?: string;
  accountIds?: readonly string[];
  /** A Category also matches everything inside it. A Transfer never matches a Category or Tag. */
  categoryIds?: readonly string[];
  tagIds?: readonly string[];
  kind?: ActivityKind;
  /**
   * The size of the amount in minor units, whichever way the money moved. Compared as stored, in
   * each Account's own currency, until Transactions carry a base-currency amount.
   */
  minAmount?: number;
  maxAmount?: number;
}

/** The chosen Categories and everything inside them. */
function withDescendants(ids: readonly string[], categories: readonly Category[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of categories)
    if (c.parentId !== undefined)
      children.set(c.parentId, [...(children.get(c.parentId) ?? []), c.id]);
  const out = new Set<string>();
  const queue = [...ids];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return out;
}

function matchesText(entry: ActivityEntry, needle: string): boolean {
  const has = (value: string | undefined) => value?.toLowerCase().includes(needle) === true;
  if (entry.kind === "transfer") return has(entry.transfer.note);
  const tx = entry.transaction;
  return has(tx.payee) || has(tx.note) || tx.lines.some((line) => has(line.itemName));
}

/**
 * Narrows Activity. Pure and platform-free so every app filters the same way. The order of
 * `entries` is kept.
 */
export function filterActivity(
  entries: readonly ActivityEntry[],
  filter: ActivityFilter,
  context: { categories: readonly Category[] },
): ActivityEntry[] {
  const needle = filter.text?.trim().toLowerCase() ?? "";
  const accounts = filter.accountIds && new Set(filter.accountIds);
  const categories = filter.categoryIds && withDescendants(filter.categoryIds, context.categories);
  const tags = filter.tagIds && new Set(filter.tagIds);

  return entries.filter((entry) => {
    const date = entry.kind === "transfer" ? entry.transfer.date : entry.transaction.date;
    if (filter.from !== undefined && date < filter.from) return false;
    if (filter.to !== undefined && date > filter.to) return false;
    if (needle !== "" && !matchesText(entry, needle)) return false;

    // A Transaction that nets to zero counts as an expense.
    const kind: ActivityKind =
      entry.kind === "transfer" ? "transfer" : entry.transaction.total > 0 ? "income" : "expense";
    if (filter.kind !== undefined && filter.kind !== kind) return false;

    if (accounts) {
      const touched =
        entry.kind === "transfer"
          ? [entry.transfer.fromAccountId, entry.transfer.toAccountId]
          : [entry.transaction.accountId];
      if (!touched.some((id) => accounts.has(id))) return false;
    }

    if (categories || tags) {
      if (entry.kind === "transfer") return false;
      if (categories && !entry.transaction.lines.some((line) => categories.has(line.categoryId)))
        return false;
      if (tags && !(entry.transaction.tagIds ?? []).some((id) => tags.has(id))) return false;
    }

    const size =
      entry.kind === "transfer" ? entry.transfer.fromAmount : Math.abs(entry.transaction.total);
    if (filter.minAmount !== undefined && size < filter.minAmount) return false;
    if (filter.maxAmount !== undefined && size > filter.maxAmount) return false;
    return true;
  });
}
