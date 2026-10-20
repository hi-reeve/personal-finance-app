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

test("build a Category tree, move, merge and delete, and keep Tags", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Categories & tags" })).toBeVisible();

  async function add(name: string, parent?: string) {
    await page.getByRole("button", { name: "Add category" }).click();
    const form = page.locator("form").filter({ hasText: "Inside" });
    await form.getByLabel("Name").fill(name);
    if (parent) {
      await form.getByRole("searchbox").fill(parent);
      await form.getByRole("button", { name: parent, exact: true }).click();
    }
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toBeVisible();
  }

  await add("Food");
  await add("Groceries", "Food");
  await add("Eating out");

  // Children are indented under their parent, in order.
  const expenses = page.getByRole("region", { name: "Expense" });
  await expect(expenses.getByRole("listitem")).toHaveText([/Food/, /Groceries/, /Eating out/]);

  // Move Groceries to the top level.
  await page.getByRole("button", { name: "Move: Groceries" }).click();
  await page.getByRole("button", { name: "Top level" }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(expenses.getByRole("listitem")).toHaveText([/Food/, /Groceries/, /Eating out/]);

  // Merge Eating out into Food, then delete the now-empty Groceries.
  await page.getByRole("button", { name: "Merge into… Eating out" }).click();
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Eating out")).toHaveCount(0);

  await page.getByRole("button", { name: "Delete: Groceries" }).click();
  await expect(page.getByText("Groceries")).toHaveCount(0);

  // Tags are flat, reused by name, and survive a reload.
  await page.getByLabel("Tag name").fill("Bali trip");
  await page.getByRole("button", { name: "Add tag" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Bali trip" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Bali trip" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Food" })).toBeVisible();
});
