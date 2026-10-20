import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { addCategory, addTransaction, openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("search and filter Activity, combine filters, and keep them while navigating", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food");
  await addCategory(page, "Groceries", "Expense", "Food");
  await addCategory(page, "Fuel");
  await addCategory(page, "Salary", "Income");

  await page.goto("/activity");
  await addTransaction(page, "25", "Food", "Warung");
  await addTransaction(page, "60", "Groceries", "Superindo");
  await addTransaction(page, "40", "Fuel", "Shell");
  await addTransaction(page, "1000", "Salary", "Acme");

  const rows = page.getByRole("list", { name: "Activity" }).getByRole("listitem");
  await expect(rows).toHaveCount(4);

  // Text finds payee, and shows how many matched.
  const search = page.getByRole("searchbox", { name: "Search activity" });
  await search.fill("WARUNG");
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("Showing 1 of 1")).toBeVisible();
  await search.fill("nothing like this");
  await expect(page.getByText("Nothing matches these filters.")).toBeVisible();

  // The filter is still there after visiting another screen.
  await search.fill("shell");
  await page.getByRole("link", { name: "Accounts" }).and(page.locator(":visible")).first().click();
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
  await page.getByRole("link", { name: "Activity" }).and(page.locator(":visible")).first().click();
  await expect(search).toHaveValue("shell");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Shell");
  await search.fill("");

  // Panel: kind, Category with its descendants, amount; each narrows, and they combine.
  await page.getByRole("button", { name: "Filters" }).click();
  await page.getByRole("button", { name: "Income", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Acme");

  await page.getByRole("button", { name: "All", exact: true }).click();
  const panel = page.locator("fieldset").filter({ hasText: "Category" }).last();
  await panel.getByRole("searchbox").fill("Food");
  await panel.getByRole("button", { name: "Food", exact: true }).click();
  await expect(rows).toHaveCount(2); // Warung (Food) and Superindo (Groceries inside Food)

  await page.getByLabel("Smallest amount").fill("30");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Superindo");
  await page.getByLabel("Smallest amount").fill("abc");
  await expect(page.getByRole("alert")).toContainText("Enter an amount");

  // Clearing brings everything back.
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(rows).toHaveCount(4);
});
