import type { Period } from "./periods";

export type BudgetPeriod = "month" | "week" | "year";
export const BUDGET_PERIODS: readonly BudgetPeriod[] = ["month", "week", "year"];

/** A limit on an expense Category, counting everything inside it. Base currency. */
export interface Budget {
  categoryId: string;
  /** Whole minor units of the base currency, above zero. The latest amount. */
  amount: number;
  period: BudgetPeriod;
  /** Unspent amounts are added to the next period and overspending is taken off it. */
  carryOver: boolean;
}

/** A limit on all spending, whatever the Category budgets add up to. */
export type OverallBudget = Omit<Budget, "categoryId">;

export type BudgetState = "on-track" | "near" | "over";

/** How a budget stands over one period. */
export interface Standing {
  /** The period these figures are for. */
  range: Period;
  /** The amount in force in this period; earlier periods keep the amount they had. */
  amount: number;
  /** What earlier periods left (or owed) when carry-over is on; otherwise zero. Never stored. */
  carryIn: number;
  /** `amount` plus `carryIn`: what can be spent in this period. */
  limit: number;
  /** What was spent, net of refunds. */
  spent: number;
  /** `limit` less `spent`; negative when over. */
  remaining: number;
  /** `spent` of `limit` in basis points (10,000 is 100%), never below zero. */
  used: number;
  /** `near` from the near-limit setting up to the limit itself; `over` only above it. */
  state: BudgetState;
  /**
   * Recurring expenses due in this period that nobody has paid or skipped, in the base currency.
   * Kept apart from `spent`: they are expected, not spent.
   */
  expected: number;
  /** Expected bills left out of `expected` because their Account is not in the base currency. */
  expectedSkipped: number;
}

export interface BudgetProgress extends Budget, Standing {
  name: string;
}

export interface OverallBudgetProgress extends OverallBudget, Standing {
  /** The Category budgets of the same period that are not inside another budgeted Category. */
  allocated: number;
  /** The overall amount less `allocated`; negative when Category budgets exceed it. */
  unallocated: number;
}

export interface BudgetStanding {
  categories: BudgetProgress[];
  overall?: OverallBudgetProgress;
}

/** A budget moved to a worse state in a period: the output other consumers can act on. */
export interface ThresholdCrossed {
  /** Absent for the overall budget. */
  categoryId?: string;
  name: string;
  range: Period;
  from: BudgetState;
  state: "near" | "over";
}

/** Where a budget turns to "near" when the setting is not chosen. */
export const DEFAULT_NEAR_LIMIT = 80;

/** Judged on the exact amounts, so a rounded percentage never changes the state. */
export function budgetStateOf(spent: number, limit: number, near: number): BudgetState {
  if (spent > limit) return "over";
  if (limit <= 0) return "on-track";
  return BigInt(spent) * 100n >= BigInt(limit) * BigInt(near) ? "near" : "on-track";
}

/** Basis points of the limit spent, never below zero; a limit already gone counts as all of it. */
export function budgetUsed(spent: number, limit: number): number {
  if (limit <= 0) return spent > limit ? 10_000 : 0;
  return Number((BigInt(Math.max(spent, 0)) * 10_000n + BigInt(limit) / 2n) / BigInt(limit));
}

const RANK: Record<BudgetState, number> = { "on-track": 0, near: 1, over: 2 };

/**
 * The budgets that moved to a worse state between two readings of the same day, for example just
 * before and just after saving a Transaction. A budget that was not there counts as on track.
 */
export function thresholdCrossings(
  before: BudgetStanding,
  after: BudgetStanding,
): ThresholdCrossed[] {
  const crossed: ThresholdCrossed[] = [];
  const check = (was: Standing | undefined, now: Standing, name: string, categoryId?: string) => {
    const from = was !== undefined && was.range.from === now.range.from ? was.state : "on-track";
    if (RANK[now.state] > RANK[from] && now.state !== "on-track")
      crossed.push({
        ...(categoryId !== undefined ? { categoryId } : {}),
        name,
        range: now.range,
        from,
        state: now.state,
      });
  };
  for (const now of after.categories)
    check(
      before.categories.find((b) => b.categoryId === now.categoryId),
      now,
      now.name,
      now.categoryId,
    );
  if (after.overall) check(before.overall, after.overall, "");
  return crossed;
}
