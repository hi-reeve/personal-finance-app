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
