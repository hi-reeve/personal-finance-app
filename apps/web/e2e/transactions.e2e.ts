import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

async function addCategory(page: Page, name: string, kind: "Expense" | "Income") {
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.locator("form").filter({ hasText: "Inside" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Kind").selectOption({ label: kind });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

async function add(page: Page, amount: string, category: string, payee?: string) {
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByRole("searchbox").fill(category);
  await dialog.getByRole("button", { name: category, exact: true }).click();
  if (payee) await dialog.getByLabel("Payee").fill(payee);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

const balance = async (page: Page, amount: string) => {
  await page.goto("/accounts");
  await expect(page.getByRole("listitem").filter({ hasText: "Wallet" })).toContainText(amount);
};

test("add, see in Activity, edit, delete, and the balance follows", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food", "Expense");
  await addCategory(page, "Salary", "Income");

  await page.goto("/activity");
  await expect(page.getByText("No transactions yet")).toBeVisible();

  // Expense and income, entered as plain positive amounts.
  await add(page, "25.50", "Food", "Warung");
  await add(page, "100", "Salary");
  const warung = page.getByRole("listitem").filter({ hasText: "Warung" });
  await expect(warung).toContainText("$25.50");
  await expect(warung).toContainText("Food");
  await expect(page.getByRole("listitem").filter({ hasText: "Salary" })).toContainText("$100.00");
  await balance(page, "$74.50");

  // Edit the expense.
  await page.goto("/activity");
  await page.getByRole("button", { name: "Edit Warung" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit transaction" });
  await dialog.getByLabel("Amount").fill("30");
  await dialog.getByLabel("Note").fill("lunch");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(warung).toContainText("$30.00");
  await expect(warung).toContainText("lunch");
  await balance(page, "$70.00");

  // Delete is a two-step action and survives a reload.
  await page.goto("/activity");
  await page.getByRole("button", { name: "Delete Warung" }).click();
  await warung.getByRole("button", { name: "Cancel" }).click();
  await expect(warung).toBeVisible();
  await page.getByRole("button", { name: "Delete Warung" }).click();
  await warung.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(warung).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await balance(page, "$100.00");
});

test("a typo is explained and nothing is saved", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food", "Expense");
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog", { name: "Add transaction" });
  await dialog.getByLabel("Amount").fill("12abc");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter an amount above zero");
  await dialog.getByLabel("Amount").fill("5");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Choose a category");
});
