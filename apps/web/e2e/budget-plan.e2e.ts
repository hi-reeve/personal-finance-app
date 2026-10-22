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

async function setBudget(
  page: Page,
  category: string,
  amount: string,
  options: { period?: string; carryOver?: boolean } = {},
) {
  await page.getByRole("button", { name: "Add budget" }).click();
  const form = page.locator("form").filter({ hasText: "Carry over" });
  await form.getByRole("searchbox").fill(category);
  await form.getByRole("button", { name: new RegExp(`(^| › )${category}$`) }).click();
  await form.getByLabel("Limit", { exact: true }).fill(amount);
  if (options.period) await form.locator("select").selectOption({ label: options.period });
  if (options.carryOver) await form.getByLabel(/Carry over/).check();
  await form.getByRole("button", { name: "Save budget" }).click();
}

const card = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });

test("an overall budget shows what the Category budgets leave unassigned", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Fuel");
  await addCategory(page, "Rent");
  await page.goto("/budgets");
  await setBudget(page, "Fuel", "100");

  await page.getByRole("button", { name: "Set overall budget" }).click();
  const form = page.locator("form").filter({ hasText: "Carry over" });
  await form.getByLabel("Limit", { exact: true }).fill("500");
  await form.getByRole("button", { name: "Save budget" }).click();
  const overall = card(page, "Overall budget");
  await expect(overall).toContainText("$400.00 not given to a category");
  await expect(page.getByRole("button", { name: "Set overall budget" })).toHaveCount(0);

  await setBudget(page, "Rent", "600");
  await expect(overall).toContainText("Category budgets are $200.00 more than this");

  await page.getByRole("button", { name: "Remove Overall budget" }).click();
  await expect(overall).toHaveCount(0);
});

test("a budget can be weekly with carry-over, and the month can start on payday", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Fuel");
  await addCategory(page, "Rent");
  await page.goto("/budgets");
  await setBudget(page, "Fuel", "100", { period: "Weekly", carryOver: true });
  await setBudget(page, "Rent", "100");
  await expect(card(page, "Fuel")).toContainText("Weekly");
  await page.getByRole("button", { name: "Change Fuel" }).click();
  await expect(page.getByLabel(/Carry over/)).toBeChecked();
  await expect(page.locator("form select")).toHaveValue("week");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/settings");
  await page.getByLabel(/Month starts on day/).fill("25");
  await page.getByLabel(/Month starts on day/).blur();
  await page.getByRole("link", { name: "Budgets" }).and(page.locator(":visible")).first().click();
  await expect(card(page, "Rent")).toContainText(/25.*24/);
});

test("saving a Transaction warns when a budget crosses a line, and Plan shows what is over", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Fuel");
  await page.goto("/budgets");
  await setBudget(page, "Fuel", "100");

  await page.goto("/activity");
  await addTransaction(page, "50", "Fuel", "Shell");
  await expect(page.getByRole("status")).not.toContainText("Fuel");

  await addTransaction(page, "35", "Fuel", "Shell again");
  await expect(page.getByRole("status")).toContainText("Fuel is near its limit.");
  await page.getByRole("status").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("status")).not.toContainText("Fuel");

  // Never blocked: the Transaction is saved and the warning follows.
  await addTransaction(page, "30", "Fuel", "Too much");
  await expect(page.getByText("Too much")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Fuel is over budget.");

  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('[data-nav="phone"]').getByText("1 over budget")).toBeAttached();
});
