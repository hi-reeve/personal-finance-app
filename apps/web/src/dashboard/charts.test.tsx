// @vitest-environment jsdom
import type { DailyTotals, SpendingByCategory } from "@pfa/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { HideAmountsProvider } from "../components/hide-amounts";
import { LocaleProvider } from "../components/locale";
import { CategoryBars } from "./category-bars";
import { DailyChart } from "./daily-chart";

const daily: DailyTotals = {
  currency: "IDR",
  kind: "expense",
  from: "2026-10-05",
  to: "2026-10-08",
  total: 305_000,
  skipped: { lines: 0 },
  days: [
    { date: "2026-10-05", total: 100_000 },
    { date: "2026-10-06", total: 0 },
    { date: "2026-10-07", total: 200_000 },
    { date: "2026-10-08", total: 5_000 },
  ],
};

const spending: SpendingByCategory = {
  currency: "IDR",
  kind: "expense",
  from: "2026-10-01",
  to: "2026-10-31",
  total: 305_000,
  skipped: { lines: 0 },
  categories: [
    { categoryId: "food", name: "Food", total: 280_000, own: 0, share: 9_180, children: [] },
    { categoryId: "fuel", name: "Fuel", total: 20_000, own: 20_000, share: 656, children: [] },
    { categoryId: "ghost", missing: true, total: 5_000, own: 5_000, share: 164, children: [] },
  ],
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

describe("DailyChart", () => {
  it("is a picture with a text summary, and a table of every day as its alternative", () => {
    mount(<DailyChart daily={daily} currency="IDR" />);
    const chart = document.querySelector("svg")!;
    expect(chart.getAttribute("aria-label")).toBe(
      "Total Rp 305,000. The biggest day was 7 Oct: Rp 200,000.",
    );
    // The summary is also plain text for anyone who cannot use the picture.
    expect(screen.getAllByText(chart.getAttribute("aria-label")!).length).toBeGreaterThan(0);

    const table = screen.getByRole("table", { name: "Days with nothing spent are left out." });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4); // header + the three days with spending
    expect(rows[2]!.textContent).toContain("7 Oct");
    expect(rows[2]!.textContent).toContain("200,000");
  });

  it("says so, and offers no table, when nothing was spent", () => {
    mount(
      <DailyChart
        daily={{ ...daily, total: 0, days: daily.days.map((d) => ({ ...d, total: 0 })) }}
        currency="IDR"
      />,
    );
    expect(document.querySelector("svg")!.getAttribute("aria-label")).toBe(
      "Nothing was spent on any day in this period.",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows no amount anywhere while amounts are hidden", () => {
    mount(<DailyChart daily={daily} currency="IDR" />, true);
    const summary = document.querySelector("svg")!.getAttribute("aria-label")!;
    expect(summary).not.toMatch(/\d{3}/);
    expect(summary).toContain("••••••");
    expect(document.body.textContent).not.toContain("200,000");
  });
});

describe("hidden amounts and the shape of the chart", () => {
  const heights = () =>
    [...document.querySelectorAll("svg rect")].map((r) => Number(r.getAttribute("height")));

  it("draws columns in proportion to the amounts while they are shown", () => {
    mount(<DailyChart daily={daily} currency="IDR" />);
    const [first, zero, second, third] = heights();
    expect(zero).toBe(0);
    expect(second!).toBeGreaterThan(first!);
    expect(first!).toBeGreaterThan(third!);
  });

  it("draws every day that had spending at one height while they are hidden", () => {
    mount(<DailyChart daily={daily} currency="IDR" />, true);
    const [first, zero, second, third] = heights();
    expect(zero).toBe(0);
    expect(new Set([first, second, third]).size).toBe(1);
  });
});

describe("CategoryBars", () => {
  it("ranks Categories with their amount and share in words, and lists them all in a table", () => {
    mount(<CategoryBars spending={spending} currency="IDR" />);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Food"),
      expect.stringContaining("Fuel"),
      expect.stringContaining("Deleted category"),
    ]);
    expect(items[0]!.textContent).toContain("91.8%");
    expect(screen.getByText("The biggest of 3 is Food at 91.8% (Rp 280,000).")).toBeTruthy();

    const table = screen.getByRole("table", { name: "Top categories" });
    expect(within(table).getAllByRole("row")).toHaveLength(4);
  });

  it("says there is nothing to rank when nothing was spent", () => {
    mount(<CategoryBars spending={{ ...spending, total: 0, categories: [] }} currency="IDR" />);
    expect(screen.getByText("No spending to rank yet.")).toBeTruthy();
  });

  it("hides amounts but keeps names and shares while amounts are hidden", () => {
    mount(<CategoryBars spending={spending} currency="IDR" />, true);
    expect(document.body.textContent).not.toContain("280,000");
    expect(document.body.textContent).toContain("Food");
    expect(document.body.textContent).toContain("91.8%");
  });
});
