import type { m } from "../paraglide/messages.js";

/** Navigation labels only: these messages take no parameters. */
export type MessageKey = Extract<keyof typeof m, `nav_${string}`>;
export type IconName =
  | "home"
  | "activity"
  | "plan"
  | "more"
  | "accounts"
  | "debts"
  | "split"
  | "reports"
  | "settings"
  | "add";

export interface Destination {
  to: string;
  label: MessageKey;
  icon: IconName;
  /** Paths that keep this destination marked current, for example Plan covers Budgets and Recurring. */
  covers?: readonly string[];
}

const home: Destination = { to: "/", label: "nav_home", icon: "home" };
const activity: Destination = { to: "/activity", label: "nav_activity", icon: "activity" };
const budgets: Destination = { to: "/budgets", label: "nav_budgets", icon: "plan" };
const recurring: Destination = { to: "/recurring", label: "nav_recurring", icon: "plan" };
const accounts: Destination = { to: "/accounts", label: "nav_accounts", icon: "accounts" };
const categories: Destination = { to: "/categories", label: "nav_categories", icon: "accounts" };
const debts: Destination = { to: "/debts", label: "nav_debts", icon: "debts" };
const split: Destination = { to: "/split", label: "nav_split", icon: "split" };
const reports: Destination = { to: "/reports", label: "nav_reports", icon: "reports" };
const settings: Destination = { to: "/settings", label: "nav_settings", icon: "settings" };

/** On phone and tablet, Plan opens Budgets; Recurring & bills sits beside it. */
const plan: Destination = {
  to: "/budgets",
  label: "nav_plan",
  icon: "plan",
  covers: ["/budgets", "/recurring"],
};
const more: Destination = {
  to: "/more",
  label: "nav_more",
  icon: "more",
  covers: ["/more", "/accounts", "/categories", "/debts", "/split", "/reports", "/settings"],
};

/** Phone bar order; Add sits in the middle and is not a destination. */
export const PHONE_LEFT = [home, activity] as const;
export const PHONE_RIGHT = [plan, more] as const;
export const RAIL = [home, activity, plan, more] as const;

export const SIDEBAR_GROUPS: readonly {
  heading?: MessageKey;
  items: readonly Destination[];
}[] = [
  { items: [home, activity] },
  { heading: "nav_group_plan", items: [budgets, recurring] },
  { heading: "nav_group_money", items: [accounts, categories, debts, split] },
  { heading: "nav_group_insights", items: [reports] },
];
export const SIDEBAR_FOOTER = settings;

/** What More lists on phone and tablet. */
export const MORE_LIST = [accounts, categories, debts, split, reports, settings] as const;

export const ALL_PATHS = [
  "/",
  "/activity",
  "/budgets",
  "/recurring",
  "/more",
  "/accounts",
  "/categories",
  "/debts",
  "/split",
  "/reports",
  "/settings",
];

export const isCurrent = (destination: Destination, pathname: string): boolean => {
  const paths = destination.covers ?? [destination.to];
  return paths.includes(pathname);
};
