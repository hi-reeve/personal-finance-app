import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { addCategory, openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
});

/** A Rupiah Account on a dollar base, one Food spend of Rp 195,000 recorded at 0.00006. */
async function spendInRupiah(page: Page) {
  await openApp(page, "/accounts");
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByLabel("Name").fill("Rupiah");
  await page.getByLabel("Currency").selectOption("IDR");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Rupiah" })).toBeVisible();
  await page.goto("/categories");
  await addCategory(page, "Food");
  await page.goto("/activity");
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Account").selectOption({ label: "Rupiah" });
  await dialog.getByLabel("Amount", { exact: true }).fill("195000");
  await dialog.getByRole("searchbox").fill("Food");
  await dialog.getByRole("button", { name: "Food", exact: true }).click();
  await dialog.getByLabel(/Exchange rate: 1 IDR/).fill("0.00006");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Today's rates: a rupiah is worth 0.00007 dollars, a dollar 0.9 euros. */
async function answerRates(page: Page) {
  await page.route("**/api.frankfurter.dev/**", async (route) => {
    const url = route.request().url();
    await route.fulfill({
      json: { rates: url.includes("symbols=EUR") ? { EUR: 0.9 } : { USD: 0.00007 } },
    });
  });
}

test("at today's rate reconverts a foreign spend, says how much higher, and never changes the records", async ({
  page,
}) => {
  await answerRates(page);
  await spendInRupiah(page);

  await page.goto("/");
  await expect(page.getByText("$11.70").first()).toBeVisible();
  await page.getByRole("button", { name: "At today's rate" }).click();
  await expect(page.getByText("$13.65").first()).toBeVisible();
  await expect(
    page.getByText("At today's rates, spending would be $1.95 higher than recorded."),
  ).toBeVisible();

  await page.getByRole("button", { name: "As recorded" }).click();
  await expect(page.getByText("$11.70").first()).toBeVisible();
  await expect(page.getByText(/higher than recorded/)).toHaveCount(0);

  // The records themselves were never touched.
  await page.goto("/activity");
  await expect(
    page.getByRole("list", { name: "Activity" }).getByRole("listitem").first(),
  ).toContainText("Rp 195,000");
});

test("a currency with no rate today says so and is left out, not guessed", async ({ page }) => {
  await spendInRupiah(page);
  await page.route("**/api.frankfurter.dev/**", (route) => route.abort());
  await page.route("**/cdn.jsdelivr.net/**", (route) => route.abort());

  await page.goto("/");
  await page.getByRole("button", { name: "At today's rate" }).click();
  await expect(page.getByText("No rate today for IDR.", { exact: false })).toBeVisible();
  await expect(page.getByText("$11.70")).toHaveCount(0);
});

test("a display currency is a labelled view: it shows beside the totals and stores nothing", async ({
  page,
}) => {
  await answerRates(page);
  await spendInRupiah(page);

  await page.goto("/settings");
  const section = page.locator("section").filter({ hasText: "Display currency" });
  await expect(section).toContainText("This device only");
  await section.getByLabel("Also show totals in").selectOption("EUR");

  await page.goto("/");
  const view = page.getByRole("region", { name: "View in EUR" });
  await expect(view).toContainText("€10.53");
  await expect(view).toContainText("Only a view: your records stay in USD.");

  // Still the base currency in the real totals, and in the data.
  await expect(page.getByText("$11.70").first()).toBeVisible();
  await page.goto("/activity");
  await expect(
    page.getByRole("list", { name: "Activity" }).getByRole("listitem").first(),
  ).toContainText("Rp 195,000");

  await page.goto("/settings");
  await section.getByLabel("Also show totals in").selectOption("");
  await page.goto("/");
  await expect(page.getByRole("region", { name: "View in EUR" })).toHaveCount(0);
});
