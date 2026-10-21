// @vitest-environment jsdom
import type { SpendingByCategory } from "@pfa/core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { HideAmountsProvider } from "../components/hide-amounts";
import { LocaleProvider } from "../components/locale";
import { CategoryTree } from "./category-tree";

const spending: SpendingByCategory = {
  currency: "IDR",
  kind: "expense",
  from: "2026-10-01",
  to: "2026-10-31",
  total: 305_000,
  skipped: { lines: 0 },
  categories: [
    {
      categoryId: "food",
      name: "Food",
      total: 280_000,
      own: 160_000,
      share: 9_180,
      ownShare: 5_246,
      children: [
        {
          categoryId: "groceries",
          name: "Groceries",
          total: 70_000,
          own: 70_000,
          share: 2_295,
          ownShare: 2_295,
          children: [],
        },
        {
          categoryId: "eating",
          name: "Eating out",
          total: 50_000,
          own: 50_000,
          share: 1_639,
          ownShare: 1_639,
          children: [],
        },
      ],
    },
    {
      categoryId: "fuel",
      name: "Fuel",
      total: 20_000,
      own: 20_000,
      share: 656,
      ownShare: 656,
      children: [],
    },
    {
      categoryId: "ghost",
      missing: true,
      total: 5_000,
      own: 5_000,
      share: 164,
      ownShare: 164,
      children: [],
    },
  ],
};

/** The bars, not the table below them that repeats every row. */
const bars = () => within(screen.getAllByRole("list")[0]!);

function mount(hidden = false) {
  return render(
    <LocaleProvider>
      <HideAmountsProvider initialHidden={hidden}>
        <CategoryTree spending={spending} currency="IDR" />
      </HideAmountsProvider>
    </LocaleProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("CategoryTree", () => {
  it("lists every top-level Category, with children hidden until opened", () => {
    mount();
    expect(bars().getByText("Food")).toBeTruthy();
    expect(bars().getByText("Fuel")).toBeTruthy();
    expect(bars().getByText("Deleted category")).toBeTruthy();
    expect(bars().queryByText("Groceries")).toBeNull();
  });

  it("opens and closes a Category, and says which state it is in", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Show what is inside Food" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(
      screen
        .getByRole("button", { name: "Hide what is inside Food" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(bars().getByText("Groceries")).toBeTruthy();
    expect(bars().getByText("Eating out")).toBeTruthy();
    // What was recorded straight into Food is its own row, so the children add up to the parent.
    expect(bars().getByText("Recorded directly in Food")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide what is inside Food" }));
    expect(bars().queryByText("Groceries")).toBeNull();
  });

  it("only offers to open a Category that has something inside it", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Fuel/ })).toBeNull();
  });

  it("says the same in words and in a table that lists every level", () => {
    mount();
    expect(
      screen.getByText(
        "The biggest of 3 is Food at 91.8% (Rp 280,000). Open a category to see what is inside it.",
      ),
    ).toBeTruthy();
    const table = screen.getByRole("table", { name: "Spending by category" });
    const rows = within(table).getAllByRole("row");
    // header + Food, Groceries, Eating out, directly in Food, Fuel, deleted
    expect(rows).toHaveLength(7);
    expect(rows[1]!.textContent).toContain("Food");
    expect(rows[1]!.textContent).toContain("280,000");
    // Biggest first, the Lines recorded straight into Food among its children.
    expect(rows[2]!.textContent).toContain("Recorded directly in Food");
    expect(rows[2]!.textContent).toContain("160,000");
    expect(rows[2]!.textContent).toContain("52.5%");
  });

  it("hides amounts but not names or shares, and draws every bar the same length", () => {
    mount(true);
    expect(document.body.textContent).not.toContain("280,000");
    expect(document.body.textContent).toContain("91.8%");
    const widths = [...document.querySelectorAll<HTMLElement>("div.bg-expense")].map(
      (bar) => bar.style.width,
    );
    expect(new Set(widths).size).toBe(1);
  });
});
