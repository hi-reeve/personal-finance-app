import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openApp } from "./helpers";

const BUILT = resolve("dist/client");

const SIZES = {
  phone: { width: 390, height: 780 },
  tablet: { width: 820, height: 1000 },
  desktop: { width: 1280, height: 800 },
} as const;
type Layout = keyof typeof SIZES;
const NAV: Record<Layout, string | null> = { phone: "phone", tablet: "rail", desktop: "sidebar" };
const ALL = ["phone", "rail", "sidebar"];

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
});

async function open(page: Page, layout: Layout, path = "/") {
  await page.setViewportSize(SIZES[layout]);
  await openApp(page, path);
  await expect(page.locator("h1")).toBeVisible();
}

for (const layout of Object.keys(SIZES) as Layout[]) {
  test(`${layout}: shows only its own navigation`, async ({ page }) => {
    await open(page, layout);
    for (const nav of ALL) {
      const expected = nav === NAV[layout];
      await expect(page.locator(`[data-nav="${nav}"]`)).toBeVisible({ visible: expected });
    }
  });

  test(`${layout}: Add opens a ${layout === "phone" ? "bottom sheet" : "centred dialog"}`, async ({
    page,
  }) => {
    await open(page, layout);
    const add = page
      .getByRole("button", { name: /^Add( transaction)?$/ })
      .and(page.locator(":visible"));
    await add.click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await expect(dialog).toBeVisible();
    const viewport = SIZES[layout];
    // Measure once it has stopped moving into place.
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return layout === "phone"
          ? Math.abs(box.y + box.height - viewport.height) < 10
          : box.y > 40 && box.y + box.height < viewport.height - 40;
      })
      .toBe(true);
    // The dialog starts listening for Escape a moment after it opens: press until it closes.
    await expect(async () => {
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 500 });
    }).toPass();
  });
}

test("tablet and desktop: Add floats bottom right outside any navigation", async ({ page }) => {
  for (const layout of ["tablet", "desktop"] as const) {
    await open(page, layout);
    const add = page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible"));
    await expect(add).toHaveCount(1);
    expect(await add.evaluate((el) => el.closest("nav"))).toBeNull();
    const box = (await add.boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(SIZES[layout].width - 40);
    expect(box.y + box.height).toBeGreaterThan(SIZES[layout].height - 40);
    if (layout === "tablet") expect(box.width).toBeCloseTo(box.height, 0);
    else await expect(add).toContainText("Add transaction");
  }
});

test("the last row of a long page is never covered by Add or the bottom bar", async ({ page }) => {
  for (const layout of Object.keys(SIZES) as Layout[]) {
    await open(page, layout, "/settings");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const last = (await page.locator("main section").last().boundingBox())!;
    const covering =
      layout === "phone"
        ? page.locator('[data-nav="phone"]')
        : page.getByRole("button", { name: "Add transaction" }).and(page.locator(":visible"));
    const cover = (await covering.boundingBox())!;
    expect(last.y + last.height, layout).toBeLessThanOrEqual(cover.y);
  }
});

test("keyboard: Tab reaches navigation and the current page is announced", async ({ page }) => {
  await open(page, "desktop", "/budgets");
  await expect(
    page.locator('[data-nav="sidebar"]').getByRole("link", { name: "Budgets" }),
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "Add transaction" })).toBeVisible();
});
