import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { addCategory, openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

async function setup(page: Page) {
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
}

async function openAdd(page: Page) {
  await page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible")).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Account").selectOption({ label: "Rupiah" });
  await dialog.getByLabel("Amount", { exact: true }).fill("195000");
  await dialog.getByRole("searchbox").fill("Food");
  await dialog.getByRole("button", { name: "Food", exact: true }).click();
  return dialog;
}

test("a foreign Transaction takes the day's rate, keeps it, and shows what it came to", async ({
  page,
}) => {
  const asked: string[] = [];
  await page.route("**/api.frankfurter.dev/**", async (route) => {
    asked.push(route.request().url());
    await route.fulfill({ json: { rates: { USD: 0.0000615 } } });
  });
  await setup(page);

  const dialog = await openAdd(page);
  const rate = dialog.getByLabel(/Exchange rate: 1 IDR/);
  await expect(rate).toHaveValue("0.0000615");
  await expect(dialog).toContainText("About $11.99.");
  expect(asked.some((url) => url.includes("base=IDR&symbols=USD"))).toBe(true);

  await dialog.getByText("Original amount (optional)").click();
  await dialog.getByLabel("Paid originally").fill("12");
  await dialog.getByLabel("Original currency").selectOption("USD");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const row = page.getByRole("list", { name: "Activity" }).getByRole("listitem").first();
  await expect(row).toContainText("Rp 195,000");
  await expect(row).toContainText("≈ $11.99");
  await expect(row).toContainText("Paid $12.00");

  // The fetched rate is remembered in this browser only.
  const saved = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("pfa.rate:")),
  );
  expect(saved).toHaveLength(1);

  // It stays frozen: after a reload the row still shows the same amount.
  await page.reload();
  await expect(
    page.getByRole("list", { name: "Activity" }).getByRole("listitem").first(),
  ).toContainText("≈ $11.99");
});

test("offline, a rate typed by hand never blocks saving", async ({ page }) => {
  await page.route("**/api.frankfurter.dev/**", (route) => route.abort());
  await page.route("**/cdn.jsdelivr.net/**", (route) => route.abort());
  await setup(page);

  const dialog = await openAdd(page);
  await expect(dialog).toContainText("No rate found. Enter one by hand.");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Enter the exchange rate.");

  await dialog.getByLabel(/Exchange rate: 1 IDR/).fill("0.00006");
  await expect(dialog).toContainText("About $11.70.");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Activity" }).getByRole("listitem").first(),
  ).toContainText("≈ $11.70");
});
