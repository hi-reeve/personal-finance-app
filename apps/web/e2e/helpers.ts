import { expect, type Page } from "@playwright/test";

/** Opens a page and, on a fresh browser profile, gets past first-run setup. */
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  const start = page.getByRole("button", { name: "Start" });
  const shell = page.locator("[data-nav]").first();
  await expect(start.or(shell)).toBeAttached();
  if (await start.isVisible()) {
    await start.click();
    await expect(page.locator("[data-nav]").first()).toBeAttached();
  }
}

/** On the Categories screen: add a Category, optionally inside another one. */
export async function addCategory(
  page: Page,
  name: string,
  kind: "Expense" | "Income" = "Expense",
  parent?: string,
) {
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.locator("form").filter({ hasText: "Inside" });
  await form.getByLabel("Name").fill(name);
  await form.getByLabel("Kind").selectOption({ label: kind });
  if (parent) {
    await form.getByRole("searchbox").fill(parent);
    await form.getByRole("button", { name: parent, exact: true }).click();
  }
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toBeVisible();
}

/** Opens Add and records a single-Line Transaction. */
export async function addTransaction(
  page: Page,
  amount: string,
  category: string,
  payee?: string,
  date?: string,
) {
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByRole("searchbox").fill(category);
  // Options read as a path, for example "Food › Groceries".
  await dialog.getByRole("button", { name: new RegExp(`(^| › )${category}$`) }).click();
  if (payee) await dialog.getByLabel("Payee").fill(payee);
  if (date) await dialog.getByLabel("Date").fill(date);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
