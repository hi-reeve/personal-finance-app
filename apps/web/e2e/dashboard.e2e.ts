import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { addCategory, addTransaction, openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

const pad = (n: number) => String(n).padStart(2, "0");
const label = (date: Date) => date.toLocaleString("en", { month: "long", year: "numeric" });

test("Home answers where the money went, and every number has a text and a table", async ({
  page,
}) => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthDay = `${lastMonth.getFullYear()}-${pad(lastMonth.getMonth() + 1)}-05`;

  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food");
  await addCategory(page, "Fuel");
  await addCategory(page, "Salary", "Income");

  await page.goto("/activity");
  await addTransaction(page, "100", "Food", "Warung");
  await addTransaction(page, "50", "Fuel", "Shell");
  await addTransaction(page, "1000", "Salary", "Acme");
  await addTransaction(page, "300", "Food", "Feast", lastMonthDay);

  await page.goto("/");
  await page.getByLabel("Summary", { exact: true }).check({ force: true });
  const main = page.getByRole("main");

  // The headline compares with the month before: 150 against 300.
  await expect(main).toContainText(`In ${label(now)} you spent $150.00.`);
  await expect(main).toContainText(`That is 50% less than ${label(lastMonth)}.`);

  // Cards, from the same report.
  const cards = main.locator(".grid").first();
  await expect(cards).toContainText("Income");
  await expect(cards).toContainText("$1,000.00");
  await expect(cards).toContainText("$850.00");

  // Top categories, with shares in words.
  const top = page.getByRole("region", { name: "Top categories" });
  await expect(top.getByRole("listitem")).toHaveCount(2);
  await expect(top.getByRole("listitem").first()).toContainText("Food");
  await expect(top.getByRole("listitem").first()).toContainText("66.7%");
  await expect(top).toContainText("The biggest of 2 is Food at 66.7% ($100.00).");

  // The daily chart is described in words, and a table lists the days.
  const daily = page.getByRole("region", { name: "Spending by day" });
  await expect(daily.getByRole("img", { name: /^Total \$150\.00\./ })).toBeVisible();
  await daily.getByText("Show as table").click();
  await expect(daily.getByRole("table")).toBeVisible();

  // Hide amounts removes every number from the page, text and chart descriptions included.
  await page.getByRole("button", { name: "Hide amounts" }).click();
  await expect(main).not.toContainText("$");
  await expect(daily.getByRole("img").first()).toHaveAttribute("aria-label", /••••••/);
  await page.getByRole("button", { name: "Hide amounts" }).click();
  await expect(main).toContainText("$150.00");

  // Step back a month: every figure follows, nothing to compare with.
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(main).toContainText(`In ${label(lastMonth)} you spent $300.00.`);
  await expect(main).not.toContainText("less than");
  await expect(top.getByRole("listitem")).toHaveCount(1);

  // An empty month says so.
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(main).toContainText("No spending recorded in");
  await expect(main).toContainText("No spending to rank yet.");
});

test("the Categories view opens a Category into what is inside it, with the same numbers", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food");
  await addCategory(page, "Groceries", "Expense", "Food");
  await addCategory(page, "Fuel");

  await page.goto("/activity");
  await addTransaction(page, "70", "Groceries", "Superindo");
  await addTransaction(page, "30", "Food", "Warung");
  await addTransaction(page, "50", "Fuel", "Shell");

  await page.goto("/");
  await page.getByLabel("Summary", { exact: true }).check({ force: true });
  const main = page.getByRole("main");
  await expect(main).toContainText("you spent $150.00");
  const summaryTop = await page
    .getByRole("region", { name: "Top categories" })
    .getByRole("listitem")
    .first()
    .textContent();
  expect(summaryTop).toContain("Food");
  expect(summaryTop).toContain("$100.00");
  expect(summaryTop).toContain("66.7%");

  // Switch views: the headline stays, and the Category tree shows the same Food figures.
  await page.getByLabel("Categories", { exact: true }).check({ force: true });
  await expect(main).toContainText("you spent $150.00");
  const tree = page.getByRole("region", { name: "Spending by category" });
  await expect(tree).toContainText("$100.00");
  await expect(tree).toContainText("66.7%");
  // The bars, not the table below them that repeats every row.
  const bars = tree.getByRole("list").first();
  await expect(bars.getByText("Groceries")).toHaveCount(0);

  await tree.getByRole("button", { name: "Show what is inside Food" }).click();
  await expect(bars.getByText("Groceries")).toBeVisible();
  await expect(bars).toContainText("Recorded directly in Food");
  await tree.getByRole("button", { name: "Hide what is inside Food" }).click();
  await expect(bars.getByText("Groceries")).toHaveCount(0);

  // The choice is remembered on this device.
  await page.reload();
  await expect(page.getByRole("region", { name: "Spending by category" })).toBeVisible();
  await expect(page.getByLabel("Categories", { exact: true })).toBeChecked();
});

test("Overview shows the same numbers, and the first view depends on the screen then sticks", async ({
  page,
}) => {
  await openApp(page, "/categories");
  await page.goto("/categories");
  await addCategory(page, "Food");
  await addCategory(page, "Fuel");
  await addCategory(page, "Salary", "Income");
  await page.goto("/activity");
  await addTransaction(page, "100", "Food", "Warung");
  await addTransaction(page, "50", "Fuel", "Shell");
  await addTransaction(page, "1000", "Salary", "Acme");

  // A wide screen starts on the Overview; a phone starts on the Summary.
  await page.goto("/");
  await expect(page.getByLabel("Overview", { exact: true })).toBeChecked();
  const main = page.getByRole("main");
  await expect(page.getByRole("region", { name: "Where it went" })).toBeVisible();

  // The strip, the ring and the six-month bars all read the same report.
  const cards = main.locator(".grid").first();
  await expect(cards).toContainText("$1,000.00");
  await expect(cards).toContainText("$150.00");
  await expect(cards).toContainText("$850.00");
  const donut = page.getByRole("region", { name: "Where it went" });
  await expect(donut).toContainText("1. Food");
  await expect(donut).toContainText("66.7%");
  await expect(donut).toContainText("$100.00");
  const monthly = page.getByRole("region", { name: "Income and spending by month" });
  await monthly.getByText("Show as table").click();
  const thisMonth = monthly.getByRole("table").getByRole("row").last();
  await expect(thisMonth).toContainText("$1,000.00");
  await expect(thisMonth).toContainText("$150.00");

  // Recent Transactions, newest first, with a way on to all of them.
  const recent = page.getByRole("region", { name: "Recent transactions" });
  await expect(recent.getByRole("listitem")).toHaveCount(3);
  await expect(recent.getByRole("listitem").first()).toContainText("Acme");
  await expect(recent.getByRole("link", { name: "See all activity" })).toBeVisible();

  // The same figures in the Summary view.
  await page.getByLabel("Summary", { exact: true }).check({ force: true });
  await expect(main).toContainText("you spent $150.00");
  await expect(page.getByRole("region", { name: "Top categories" })).toContainText("66.7%");

  // The choice sticks on this device, whatever the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByLabel("Summary", { exact: true })).toBeChecked();
});

test("a phone starts on the Summary and stacks the Overview in one column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/");
  await page.goto("/");
  await expect(page.getByLabel("Summary", { exact: true })).toBeChecked();

  await page.getByLabel("Overview", { exact: true }).check({ force: true });
  const donut = page.getByRole("region", { name: "Where it went" });
  const monthly = page.getByRole("region", { name: "Income and spending by month" });
  const a = (await donut.boundingBox())!;
  const b = (await monthly.boundingBox())!;
  // Stacked: the second sits below the first, not beside it.
  expect(b.y).toBeGreaterThan(a.y + a.height - 1);
  expect(Math.abs(a.x - b.x)).toBeLessThan(2);

  await page.setViewportSize({ width: 1280, height: 800 });
  const wide = {
    donut: (await donut.boundingBox())!,
    monthly: (await monthly.boundingBox())!,
  };
  // Side by side on a wide screen.
  expect(wide.monthly.x).toBeGreaterThan(wide.donut.x + wide.donut.width - 1);
});
