import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { addCategory, addTransaction, openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
});

async function setBudget(page: Page, category: string, amount: string) {
  await page.getByRole("button", { name: "Add budget" }).click();
  const form = page.locator("form").filter({ hasText: "Monthly limit" });
  await form.getByRole("searchbox").fill(category);
  await form.getByRole("button", { name: new RegExp(`(^| › )${category}$`) }).click();
  await form.getByLabel("Monthly limit").fill(amount);
  await form.getByRole("button", { name: "Save budget" }).click();
  await expect(page.getByRole("heading", { name: category, exact: false }).first()).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("a budget counts what is inside the Category, shows three states, and never blocks", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food");
  await addCategory(page, "Groceries", "Expense", "Food");
  await addCategory(page, "Fuel");
  await addCategory(page, "Rent");

  await page.goto("/activity");
  await addTransaction(page, "40", "Groceries", "Superindo");
  await addTransaction(page, "40", "Food", "Warung");
  await addTransaction(page, "120", "Fuel", "Shell");

  await page.goto("/budgets");
  await expect(page.getByText("No budgets yet")).toBeVisible();
  await setBudget(page, "Food", "100");
  await setBudget(page, "Fuel", "100");
  await setBudget(page, "Rent", "1,000");

  // The parent counts its child: 40 + 40 of 100 is 80%, which is near the limit.
  const food = card(page, "Food");
  await expect(food).toContainText("Near limit");
  await expect(food).toContainText("$80.00");
  await expect(food).toContainText("$20.00 left");
  await expect(food.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "80");
  await expect(food.getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "Near limit: 80% used",
  );

  // Over, told in words and by how much.
  const fuel = card(page, "Fuel");
  await expect(fuel).toContainText("Over budget");
  await expect(fuel).toContainText("$20.00 over");

  await expect(card(page, "Rent")).toContainText("On track");

  // A Transaction is never blocked, however far over.
  await page.goto("/activity");
  await addTransaction(page, "500", "Fuel", "Shell again");
  await expect(page.getByText("Shell again")).toBeVisible();
  await page.goto("/budgets");
  await expect(card(page, "Fuel")).toContainText("$520.00 over");

  // The near-limit line is a setting: at 90% Food is on track again.
  await page.goto("/settings");
  await page.getByLabel(/Warn me when a budget reaches/).fill("90");
  // Move on inside the app, so the save is not cut off by a page load.
  await page.getByRole("link", { name: "Budgets" }).and(page.locator(":visible")).first().click();
  await expect(card(page, "Food")).toContainText("On track");

  // Change one, and remove one.
  await page.getByRole("button", { name: "Change Fuel" }).click();
  await page.getByLabel("Monthly limit").fill("1,000");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(card(page, "Fuel")).toContainText("On track");
  await page.getByRole("button", { name: "Remove Rent" }).click();
  await expect(card(page, "Rent")).toHaveCount(0);
});

test("a typo in the limit is explained and a budget needs a Category", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Fuel");
  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add budget" }).click();
  const form = page.locator("form").filter({ hasText: "Monthly limit" });
  await form.getByLabel("Monthly limit").fill("100");
  await form.getByRole("button", { name: "Save budget" }).click();
  await expect(form.getByRole("alert")).toContainText("Choose a category");
  await form.getByRole("searchbox").fill("Fuel");
  await form.getByRole("button", { name: "Fuel", exact: true }).click();
  await form.getByLabel("Monthly limit").fill("12abc");
  await form.getByRole("button", { name: "Save budget" }).click();
  await expect(form.getByRole("alert")).toContainText("Enter an amount above zero");
});
