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

/** A local calendar date `days` from today, the way the app reads its own "today". */
function iso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function addItem(
  page: Page,
  name: string,
  category: string,
  amount: string,
  start: string,
  subscription = false,
) {
  await page.getByRole("button", { name: "Add recurring item" }).click();
  const form = page.locator("form").filter({ hasText: "First due date" });
  await form.getByLabel("Name").fill(name);
  await form.getByRole("searchbox").fill(category);
  await form.getByRole("button", { name: new RegExp(`(^| › )${category}$`) }).click();
  await form.getByLabel("Amount").fill(amount);
  await form.getByLabel("First due date").fill(start);
  if (subscription) await form.getByLabel("This is a subscription").check();
  await form.getByRole("button", { name: "Save item" }).click();
  await expect(form).toHaveCount(0);
}

test("a bill waits as overdue until paid, and shows expected against paid", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Internet");
  await page.goto("/recurring");
  await expect(page.getByText("Nothing recurring yet")).toBeVisible();
  await addItem(page, "Fiber", "Internet", "850", iso(-5));

  const row = page.getByRole("listitem").filter({ hasText: "Overdue" });
  await expect(row).toContainText("Fiber");
  await expect(row).toContainText("$850.00");

  // Nothing counts before it is paid.
  await page.goto("/activity");
  await expect(page.getByText("Fiber")).toHaveCount(0);

  await page.goto("/recurring");
  await page.getByRole("button", { name: "Mark Fiber paid" }).first().click();
  await page.getByLabel("Paid amount").fill("840");
  await page.getByRole("button", { name: "Confirm paid" }).click();
  await expect(page.getByText("Expected $850.00, paid $840.00, $10.00 less")).toBeVisible();
  // Only next month's is left to act on.
  await expect(page.getByRole("button", { name: "Mark Fiber paid" })).toHaveCount(1);

  await page.goto("/activity");
  await expect(page.getByText("Fiber")).toBeVisible();
});

test("missed bills stay until skipped, one by one or all older at once", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Internet");
  await page.goto("/recurring");
  await addItem(page, "Fiber", "Internet", "850", iso(-50));

  await expect(page.getByText("Overdue")).toHaveCount(2);
  await page.getByRole("button", { name: "Skip all older Fiber" }).last().click();
  await expect(page.getByText("Overdue")).toHaveCount(0);
  // Skipped ones are kept in the history.
  await expect(page.getByText("Skipped").first()).toBeVisible();
  await page.getByRole("button", { name: "Reopen Fiber" }).first().click();
  await expect(page.getByText("Overdue")).toHaveCount(1);
});

test("an existing Transaction can pay a bill instead of making another", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Internet");
  await page.goto("/activity");
  await addTransaction(page, "849", "Internet", "Paid at the store", iso(-3));
  await page.goto("/recurring");
  await addItem(page, "Fiber", "Internet", "850", iso(-5));

  await page.getByRole("button", { name: "Link existing for Fiber" }).first().click();
  await page.getByRole("button", { name: /Link .*849/ }).click();
  await expect(page.getByText("Expected $850.00, paid $849.00, $1.00 less")).toBeVisible();

  await page.goto("/activity");
  await expect(page.getByText("Paid at the store")).toHaveCount(1);
  await expect(page.getByText("Fiber")).toHaveCount(0);
});

test("a subscription adds to a monthly total, and its bill shows on the budget until paused", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Streaming");

  await page.goto("/budgets");
  await page.getByRole("button", { name: "Add budget" }).click();
  const budget = page.locator("form").filter({ hasText: "Carry over" });
  await budget.getByRole("searchbox").fill("Streaming");
  await budget.getByRole("button", { name: /(^| › )Streaming$/ }).click();
  await budget.getByLabel("Limit", { exact: true }).fill("500");
  await budget.getByRole("button", { name: "Save budget" }).click();
  const card = page.getByRole("listitem").filter({ hasText: "Streaming" });
  await expect(card).toContainText("$0.00");
  await expect(card).not.toContainText("Bills still to pay");

  await page.goto("/recurring");
  await expect(page.getByText("No subscriptions yet")).toBeVisible();
  await addItem(page, "Netflix", "Streaming", "150", iso(0), true);
  await expect(page.getByText("$150.00 a month").first()).toBeVisible();

  await page.goto("/budgets");
  await expect(card).toContainText("Bills still to pay: $150.00");
  await expect(card).toContainText("After bills: $350.00 left");

  await page.goto("/recurring");
  await page.getByRole("button", { name: "Pause Netflix" }).click();
  await expect(page.getByText("Paused")).toBeVisible();
  // Only the paused entry's own line is left: the total no longer counts it.
  await expect(page.getByText("$150.00 a month")).toHaveCount(1);
  await page.goto("/budgets");
  await expect(card).not.toContainText("Bills still to pay");
});

test("a new price starts on its date and leaves earlier bills as they were", async ({ page }) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Streaming");
  await page.goto("/recurring");
  await addItem(page, "Netflix", "Streaming", "150", iso(-40), true);

  await page.getByRole("button", { name: "Change Netflix" }).click();
  const form = page.locator("form").filter({ hasText: "New price applies from" });
  await form.getByLabel("Amount").fill("186");
  await form.getByLabel("New price applies from").fill(iso(-5));
  await form.getByRole("button", { name: "Save item" }).click();
  await expect(form).toHaveCount(0);

  await expect(page.getByText("$186.00 a month").first()).toBeVisible();
  // The old bills are still $150.00; the one due after the change is $186.00.
  await expect(page.getByRole("listitem").filter({ hasText: "Overdue" }).first()).toContainText(
    "$150.00",
  );
});
