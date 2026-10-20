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

async function addAccount(page: Page, name: string, currency: string, opening: string) {
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Currency").selectOption(currency);
  await page.getByLabel("Opening balance").fill(opening);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

const balanceOf = (page: Page, name: string) =>
  page.getByRole("listitem").filter({ hasText: name });

test("a Transfer moves money, takes a fee, crosses currencies, and is not spending", async ({
  page,
}) => {
  await openApp(page, "/accounts");
  await page.goto("/accounts");
  await addAccount(page, "Savings", "USD", "1,000");
  await addAccount(page, "Euro pot", "EUR", "0");

  await page.goto("/categories");
  await page.getByRole("button", { name: "Add category" }).click();
  const form = page.locator("form").filter({ hasText: "Inside" });
  await form.getByLabel("Name").fill("Bank fees");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Bank fees" })).toBeVisible();

  // Same currency, with a fee.
  await page.goto("/activity");
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Add transfer" })).toBeVisible();
  await dialog.getByLabel("From account").selectOption({ label: "Savings" });
  await dialog.getByLabel("To account").selectOption({ label: "Wallet" });
  await dialog.getByLabel("Amount sent").fill("200");
  await expect(dialog.getByLabel("Amount received")).toHaveCount(0);
  await dialog.getByLabel("Fee (optional)").fill("2.50");
  await dialog.getByRole("searchbox").fill("Bank fees");
  await dialog.getByRole("button", { name: "Bank fees", exact: true }).click();
  await dialog.getByRole("button", { name: "Add transfer", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const row = page.getByRole("listitem").filter({ hasText: "Savings → Wallet" });
  await expect(row).toContainText("$200.00");
  await expect(row).toContainText("Fee $2.50 · Bank fees");
  // The fee lives inside the Transfer, not as a Transaction of its own.
  await expect(page.getByRole("listitem")).toHaveCount(1);

  await page.goto("/accounts");
  await expect(balanceOf(page, "Savings")).toContainText("$797.50");
  await expect(balanceOf(page, "Wallet")).toContainText("$200.00");

  // Across currencies each leg has its own amount.
  await page.goto("/activity");
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await dialog.getByLabel("From account").selectOption({ label: "Savings" });
  await dialog.getByLabel("To account").selectOption({ label: "Euro pot" });
  await dialog.getByLabel("Amount sent").fill("100");
  await dialog.getByLabel("Amount received").fill("92");
  await dialog.getByRole("button", { name: "Add transfer", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "Savings → Euro pot" })).toContainText(
    "$100.00 → €92.00",
  );
  await page.goto("/accounts");
  await expect(balanceOf(page, "Savings")).toContainText("$697.50");
  await expect(balanceOf(page, "Euro pot")).toContainText("€92.00");

  // Editing the fee away, then deleting the Transfer, brings the balances back.
  await page.goto("/activity");
  await page.getByRole("button", { name: "Edit transfer Savings → Wallet" }).click();
  const edit = page.getByRole("dialog", { name: "Edit transfer" });
  await edit.getByLabel("Fee (optional)").fill("");
  // The category picker collapses; wait for the layout to settle before pressing Save.
  await expect(edit.getByRole("group", { name: "Fee category" })).toHaveCount(0);
  await edit.getByRole("button", { name: "Save transfer" }).click();
  await expect(edit).toHaveCount(0);
  await expect(row).not.toContainText("Fee");
  await page.getByRole("button", { name: "Delete transfer Savings → Wallet" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await page.goto("/accounts");
  await expect(balanceOf(page, "Savings")).toContainText("$900.00");
  await expect(balanceOf(page, "Wallet")).toContainText("$0.00");
});

test("a Transfer needs two Accounts", async ({ page }) => {
  await openApp(page, "/activity");
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Transfer", exact: true }).click();
  await expect(dialog).toContainText("A transfer needs two accounts");
});
