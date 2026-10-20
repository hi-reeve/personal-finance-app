// @vitest-environment jsdom
import type { Category } from "@pfa/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CategoryPicker } from "./category-picker";
import { LocaleProvider } from "./locale";

const cat = (id: string, name: string, kind: Category["kind"], parentId?: string): Category => ({
  id,
  name,
  kind,
  ...(parentId !== undefined ? { parentId } : {}),
  createdAt: 0,
});

const food = cat("food", "Food", "expense");
const groceries = cat("groceries", "Groceries", "expense", "food");
const salary = cat("salary", "Salary", "income");
const all = [food, groceries, salary];

function mount(props: Partial<Parameters<typeof CategoryPicker>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <LocaleProvider>
      <CategoryPicker
        categories={all}
        recent={[groceries]}
        value={undefined}
        onChange={onChange}
        {...props}
      />
    </LocaleProvider>,
  );
  return onChange;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("CategoryPicker", () => {
  it("shows recents first and every Category with its full path", () => {
    mount();
    const recent = screen.getByRole("region", { name: "Recent" });
    expect(recent.textContent).toContain("Food › Groceries");
    expect(screen.getByRole("region", { name: "All categories" }).textContent).toContain("Salary");
  });

  it("filters by search in any case and hides the recents while searching", () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search categories" }), {
      target: { value: "GROC" },
    });
    expect(screen.queryByRole("region", { name: "Recent" })).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Food › Groceries"]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("No category matches.")).toBeTruthy();
  });

  it("reports the chosen Category and marks it pressed", () => {
    const onChange = mount({ value: "salary" });
    fireEvent.click(screen.getByRole("button", { name: "Food" }));
    expect(onChange).toHaveBeenCalledWith("food");
    expect(screen.getByRole("button", { name: "Salary" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("limits to one kind and leaves out excluded Categories", () => {
    mount({ kind: "expense", exclude: new Set(["groceries"]), recent: [] });
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Food"]);
  });

  it("offers a none choice when asked, such as the top level", () => {
    const onChange = mount({ noneLabel: "Top level", value: "food" });
    fireEvent.click(screen.getByRole("button", { name: "Top level" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
