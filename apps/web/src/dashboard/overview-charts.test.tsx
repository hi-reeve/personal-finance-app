// @vitest-environment jsdom
import type { MonthlyTotals, SpendingByCategory } from "@pfa/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { HideAmountsProvider } from "../components/hide-amounts";
import { LocaleProvider } from "../components/locale";
import { DonutChart } from "./donut-chart";
import { MonthlyBars } from "./monthly-bars";

const cat = (id: string, name: string, total: number, share: number) => ({
  categoryId: id,
  name,
  total,
  own: total,
  ownShare: share,
  share,
  children: [],
});

const spending: SpendingByCategory = {
  currency: "IDR",
  kind: "expense",
  from: "2026-10-01",
  to: "2026-10-31",
  total: 1_000_000,
  skipped: { lines: 0 },
  noRate: [],
  categories: [
    cat("a", "Food", 400_000, 4_000),
    cat("b", "Rent", 300_000, 3_000),
    cat("c", "Fuel", 100_000, 1_000),
    cat("d", "Fun", 80_000, 800),
    cat("e", "Gifts", 60_000, 600),
    cat("f", "Pets", 40_000, 400),
    cat("g", "Misc", 20_000, 200),
  ],
};

const monthly: MonthlyTotals = {
  currency: "IDR",
  from: "2026-05-01",
  to: "2026-10-31",
  skipped: { lines: 0 },
  months: [
    ["2026-05", 0, 0],
    ["2026-06", 5_000_000, 3_000_000],
    ["2026-07", 5_000_000, 6_000_000],
    ["2026-08", 5_000_000, 2_000_000],
    ["2026-09", 0, 1_000_000],
    ["2026-10", 8_000_000, 1_000_000],
  ].map(([month, income, expense]) => ({
    month: month as string,
    from: `${month}-01`,
    to: `${month}-28`,
    income: income as number,
    expense: expense as number,
  })),
};

function mount(ui: React.ReactNode, hidden = false) {
  return render(
    <LocaleProvider>
      <HideAmountsProvider initialHidden={hidden}>{ui}</HideAmountsProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("DonutChart", () => {
  it("numbers the biggest slices and gathers the rest as Other, adding up to the whole", () => {
    mount(<DonutChart spending={spending} currency="IDR" />);
    const legend = within(screen.getByRole("list"));
    const items = legend.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(6); // five named + Other
    expect(items[0]).toContain("1. Food");
    expect(items[0]).toContain("40%");
    expect(items[5]).toContain("6. Other");
    expect(items[5]).toContain("6%"); // Pets 4% + Misc 2%
    expect(items[5]).toContain("60,000");
  });

  it("says the biggest slice in words, and lists every slice in a table", () => {
    mount(<DonutChart spending={spending} currency="IDR" />);
    expect(screen.getByText("6 parts. The biggest is Food at 40% (Rp 400,000).")).toBeTruthy();
    const table = screen.getByRole("table", { name: "Where it went" });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
  });

  it("is a picture only: the ring is hidden from assistive technology", () => {
    mount(<DonutChart spending={spending} currency="IDR" />);
    expect(document.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("hides amounts but not names or shares", () => {
    mount(<DonutChart spending={spending} currency="IDR" />, true);
    expect(document.body.textContent).not.toContain("400,000");
    expect(document.body.textContent).toContain("1. Food");
    expect(document.body.textContent).toContain("40%");
  });

  it("says there is nothing to show when nothing was spent", () => {
    mount(<DonutChart spending={{ ...spending, total: 0, categories: [] }} currency="IDR" />);
    expect(screen.getByText("No spending to show yet.")).toBeTruthy();
  });
});

describe("MonthlyBars", () => {
  const heights = (className: string) =>
    [...document.querySelectorAll(`svg rect.${className}`)].map((r) =>
      Number(r.getAttribute("height")),
    );

  it("pairs income and spending for every month, told apart by place as well as colour", () => {
    mount(<MonthlyBars monthly={monthly} currency="IDR" />);
    expect(document.querySelectorAll("svg rect.fill-income")).toHaveLength(6);
    expect(document.querySelectorAll("svg rect.fill-expense")).toHaveLength(6);
    const first = document.querySelector("svg rect.fill-income")!;
    const second = document.querySelector("svg rect.fill-expense")!;
    expect(Number(first.getAttribute("x"))).toBeLessThan(Number(second.getAttribute("x")));
    expect(screen.getAllByText("Income").length).toBeGreaterThan(0);
  });

  it("describes the six months in words and in a table", () => {
    mount(<MonthlyBars monthly={monthly} currency="IDR" />);
    const summary = document.querySelector("svg")!.getAttribute("aria-label")!;
    expect(summary).toContain("Over 6 months you earned Rp 23,000,000 and spent Rp 13,000,000.");
    expect(summary).toContain("The biggest month for spending was July 2026 (Rp 6,000,000).");
    const table = screen.getByRole("table", { name: "Income and spending by month" });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
  });

  it("draws zero months with no bar", () => {
    mount(<MonthlyBars monthly={monthly} currency="IDR" />);
    expect(heights("fill-income")[0]).toBe(0);
    expect(heights("fill-expense")[0]).toBe(0);
    expect(heights("fill-income")[5]).toBeGreaterThan(heights("fill-income")[1]!);
  });

  it("draws every non-zero bar the same height while amounts are hidden", () => {
    mount(<MonthlyBars monthly={monthly} currency="IDR" />, true);
    const drawn = [...heights("fill-income"), ...heights("fill-expense")].filter((h) => h > 0);
    expect(new Set(drawn).size).toBe(1);
    expect(document.querySelector("svg")!.getAttribute("aria-label")).not.toContain("Rp");
  });
});
