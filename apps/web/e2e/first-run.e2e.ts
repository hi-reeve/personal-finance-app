import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
});

test("a new user sets up with no sign-up, and it is all still there after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Personal finance" })).toBeVisible();
  await expect(page.getByText("No sign-up")).toBeVisible();
  await expect(page.locator("[data-nav]").first()).toHaveCount(0);

  await page.getByLabel("Base currency").selectOption("IDR");
  await page.getByLabel("Account name").fill("Dompet harian");
  await page.getByLabel("Type").selectOption("ewallet");
  await page.getByRole("button", { name: "Start" }).click();

  const banner = page.getByRole("status").filter({ hasText: "only on this device" });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute("data-level", "gentle");

  await page.goto("/accounts");
  await expect(page.getByText("Dompet harian")).toBeVisible();
  await expect(page.getByText("E-wallet")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Start" })).toHaveCount(0);
  await expect(page.getByText("Dompet harian")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "only on this device" })).toBeVisible();
});

test("the setup screen follows the chosen language", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Bahasa Indonesia").check({ force: true });
  await expect(page.getByRole("button", { name: "Mulai" })).toBeVisible();
  await expect(page.getByLabel("Mata uang dasar")).toHaveValue("USD");
});

test("after a week the full-screen reminder appears, can be put off for a day, and never locks the app", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("[data-nav]").first()).toBeAttached();

  // Eight days later (the page's clock only; the stored setup time stays in the past).
  await page.clock.install({ time: Date.now() + 8 * 24 * 60 * 60 * 1000 });
  await page.reload();

  const prompt = page.getByRole("dialog", { name: "Your data is only on this device" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Remind me tomorrow" }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "only on this device" })).toHaveAttribute(
    "data-level",
    "strong",
  );

  await page.reload();
  await expect(prompt).toBeHidden();
});
