import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

test("manage Accounts: add, edit, default, adjust, archive, restore and delete", async ({
  page,
}) => {
  await openApp(page, "/accounts");
  await page.goto("/accounts");

  // Add a bank Account with an opening balance.
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Bank BCA");
  await page.getByLabel("Type").selectOption("bank");
  await page.getByLabel("Currency").selectOption("IDR");
  await page.getByLabel("Opening balance").fill("1,500,000");
  await page.getByRole("button", { name: "Save" }).click();
  const bank = page.getByRole("listitem").filter({ hasText: "Bank BCA" });
  await expect(bank).toContainText("Rp 1,500,000");

  // Edit: new name, colour, and make it the default.
  await bank.getByRole("button", { name: "Edit Bank BCA" }).click();
  await page.getByLabel("Name").fill("BCA savings");
  await page.getByLabel("Colour").selectOption("teal");
  await page.getByLabel("Use as default account").check();
  await page.getByRole("button", { name: "Save" }).click();
  const renamed = page.getByRole("listitem").filter({ hasText: "BCA savings" });
  await expect(renamed).toContainText("Default");

  // Balance adjustment records a Transaction, so the Account now has history.
  await renamed.getByRole("button", { name: "Adjust balance" }).click();
  await page.getByLabel("Balance should be").fill("1,400,000");
  await page.getByRole("button", { name: "Record adjustment" }).click();
  await expect(renamed).toContainText("Rp 1,400,000");
  await expect(renamed.getByRole("button", { name: "Delete" })).toHaveCount(0);

  // Currency is locked once there is history.
  await renamed.getByRole("button", { name: "Edit BCA savings" }).click();
  await expect(page.getByLabel("Currency")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();

  // It survives a reload, and can only be archived, then restored.
  await page.reload();
  await expect(renamed).toContainText("Rp 1,400,000");
  await renamed.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Archived" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "BCA savings" })).toContainText(
    "Rp 1,400,000",
  );
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Archived" })).toHaveCount(0);

  // An Account without history is deleted outright.
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Scratch");
  await page.getByRole("button", { name: "Save" }).click();
  const scratch = page.getByRole("listitem").filter({ hasText: "Scratch" });
  await scratch.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Scratch")).toHaveCount(0);
});

test("a typo in an amount is explained, not saved", async ({ page }) => {
  await openApp(page, "/accounts");
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Oops");
  await page.getByLabel("Opening balance").fill("12abc");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter an amount");
  await expect(page.getByRole("listitem").filter({ hasText: "Oops" })).toHaveCount(0);
});
