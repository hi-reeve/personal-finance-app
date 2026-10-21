import type { CategorySpend, CurrencyCode, SpendingByCategory } from "@pfa/core";
import { useState } from "react";
import { formatPercent } from "../app/percent";
import { Amount } from "../components/amount";
import { useHideAmounts, useMoneyText } from "../components/hide-amounts";
import { useLocale } from "../components/locale";
import { FOCUS } from "../components/styles";

/** One line of the tree: a Category, or the Lines recorded straight into a parent. */
interface Row {
  key: string;
  name: string;
  total: number;
  share: number;
  depth: number;
  /** Rows inside this one. */
  children: Row[];
}

/** Turns the report into rows, with a parent's own Lines shown as a row of their own. */
function rowsOf(
  nodes: readonly CategorySpend[],
  depth: number,
  own: (name: string) => string,
  missing: string,
): Row[] {
  return nodes
    .filter((node) => node.total !== 0)
    .map((node) => {
      const name = node.name ?? missing;
      const inside = rowsOf(node.children, depth + 1, own, missing);
      if (inside.length > 0 && node.own !== 0)
        inside.push({
          key: `${node.categoryId}:own`,
          name: own(name),
          total: node.own,
          share: node.ownShare,
          depth: depth + 1,
          children: [],
        });
      // Largest first, the Lines recorded straight into the parent among them.
      inside.sort((a, b) => b.total - a.total);
      return {
        key: node.categoryId,
        name,
        total: node.total,
        share: node.share,
        depth,
        children: inside,
      };
    });
}

const flatten = (rows: readonly Row[]): Row[] =>
  rows.flatMap((row) => [row, ...flatten(row.children)]);

/**
 * Every top-level Category as a bar, each opening into what is inside it. The same report the
 * Summary reads, so the numbers cannot differ. A table and a sentence say it all without the bars.
 */
export function CategoryTree({
  spending,
  currency,
}: {
  spending: SpendingByCategory;
  currency: CurrencyCode;
}) {
  const { t, money, numberFormat } = useLocale();
  const text = useMoneyText();
  const { hidden } = useHideAmounts();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const rows = rowsOf(spending.categories, 0, (name) => t.tree_own({ name }), t.top_missing());
  const biggest = rows[0];

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const render = (row: Row) => {
    const expanded = open.has(row.key);
    return (
      <li key={row.key} className="flex flex-col gap-2">
        <div
          className="flex flex-col gap-1"
          style={{ marginInlineStart: `${row.depth * 1.25}rem` }}
        >
          <div className="flex items-baseline justify-between gap-3">
            {row.children.length > 0 ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={(expanded ? t.tree_collapse : t.tree_expand)({ name: row.name })}
                onClick={() => toggle(row.key)}
                className={`flex min-h-11 min-w-0 items-center gap-2 text-start ${FOCUS}`}
              >
                <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                <span className="truncate">{row.name}</span>
              </button>
            ) : (
              <span className="flex min-h-11 min-w-0 items-center gap-2">
                <span aria-hidden="true" className="inline-block w-[1ch]" />
                <span className="truncate">{row.name}</span>
              </span>
            )}
            <span className="flex shrink-0 items-baseline gap-2">
              <Amount direction="neutral" variant="list" formatted={money(row.total, currency)} />
              <span className="text-sm text-ink-muted">
                {formatPercent(row.share, numberFormat)}%
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-line" aria-hidden="true">
            <div
              className="h-2 rounded-full bg-expense"
              // Bars are all the same length while amounts are hidden, so length reveals nothing.
              style={{ width: `${hidden ? 50 : Math.max(row.share / 100, 1)}%` }}
            />
          </div>
        </div>
        {expanded && <ul className="flex flex-col gap-2">{row.children.map(render)}</ul>}
      </li>
    );
  };

  return (
    <section aria-labelledby="tree-heading" className="flex flex-col gap-3">
      <h2 id="tree-heading" className="font-medium">
        {t.tree_heading()}
      </h2>
      {biggest === undefined ? (
        <p className="text-ink-muted">{t.tree_none()}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">{rows.map(render)}</ul>
          <p className="text-sm text-ink-muted">
            {t.tree_summary({
              count: rows.length,
              name: biggest.name,
              share: formatPercent(biggest.share, numberFormat),
              amount: text(money(biggest.total, currency)),
            })}
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-2">{t.chart_show_table()}</summary>
            <table className="w-full text-sm">
              <caption className="sr-only">{t.tree_heading()}</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 text-start">
                    {t.chart_category()}
                  </th>
                  <th scope="col" className="py-1 text-end">
                    {t.chart_amount()}
                  </th>
                  <th scope="col" className="py-1 text-end">
                    {t.chart_share()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {flatten(rows).map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <th
                      scope="row"
                      className="py-1 text-start font-normal"
                      style={{ paddingInlineStart: `${row.depth * 1.25}rem` }}
                    >
                      {row.name}
                    </th>
                    <td className="py-1 text-end">
                      <Amount
                        direction="neutral"
                        variant="list"
                        formatted={money(row.total, currency)}
                      />
                    </td>
                    <td className="py-1 text-end">{formatPercent(row.share, numberFormat)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
