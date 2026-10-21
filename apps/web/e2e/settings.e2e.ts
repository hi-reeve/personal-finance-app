import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { openApp } from "./helpers";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("each setting says where it is kept, and changes apply at once and last", async ({ page }) => {
  await openApp(page, "/settings");
  await page.goto("/settings");

  // Where each lives is written next to it.
  const section = (name: string) => page.getByRole("region", { name });
  await expect(section("Numbers and dates")).toContainText("Synced across your devices");
  await expect(section("Language")).toContainText("This device only");
  await expect(section("Appearance")).toContainText("This device only");
  await expect(section("Privacy")).toContainText("This device only");

  // Defaults follow the device: English uses 1,234.50 and a spelled-out month.
  const amounts = section("Amounts");
  await expect(amounts).toContainText("Rp 25,000");
  await expect(amounts).toContainText("Today is 18 Oct 2026");

  // Number and date format change the preview at once.
  await page.getByLabel("1.234,50").check({ force: true });
  await expect(amounts).toContainText("Rp 25.000");
  await page.getByLabel("2026-10-18").check({ force: true });
  await expect(amounts).toContainText("Today is 2026-10-18");

  // They are kept: after a reload they still apply.
  await page.reload();
  await expect(section("Amounts")).toContainText("Rp 25.000");
  await expect(section("Amounts")).toContainText("Today is 2026-10-18");

  // They are in the synced settings, not just this browser: with this browser's own copy wiped,
  // the app still brings them back from the shared data.
  await page.evaluate(() => {
    localStorage.removeItem("pfa.number-format");
    localStorage.removeItem("pfa.date-format");
  });
  await page.reload();
  await expect(section("Amounts")).toContainText("Rp 25.000");
  await expect(section("Amounts")).toContainText("Today is 2026-10-18");

  // Device-only choices live in this browser's storage and apply at once.
  await page.getByLabel("Dark", { exact: true }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const stored = await page.evaluate(() => localStorage.getItem("pfa.appearance"));
  expect(JSON.parse(stored!)).toMatchObject({ theme: "dark" });

  // The language is its own choice, apart from the number format.
  await page.getByLabel("Bahasa Indonesia").check({ force: true });
  await expect(section("Bahasa")).toContainText("Hanya perangkat ini");
  await expect(section("Angka dan tanggal")).toContainText("Disinkronkan ke semua perangkat Anda");
  await expect(section("Pratinjau").or(section("Jumlah"))).toContainText("Rp 25.000");
});

test("amounts can always start hidden", async ({ page }) => {
  await openApp(page, "/settings");
  await page.goto("/settings");
  await page.getByLabel("Always hidden").check({ force: true });

  await page.goto("/");
  await page.reload();
  const main = page.getByRole("main");
  await expect(page.getByRole("button", { name: "Hide amounts" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(main).not.toContainText("$");

  // Showing them for now does not change the next start.
  await page.getByRole("button", { name: "Hide amounts" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Hide amounts" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
