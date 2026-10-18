import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildPrecache } from "../scripts/precache";

const BUILT = resolve("dist/client");

async function serve(page: Page, dir: string) {
  await page.request.post(`/__site?dir=${encodeURIComponent(dir)}`, {
    headers: { "x-pfa-test": "1" },
  });
}

/** A copy of the built site that looks like the next release: a different shell and service worker. */
function nextRelease(): string {
  const dir = mkdtempSync(join(tmpdir(), "pfa-release-"));
  cpSync(BUILT, dir, { recursive: true });
  const shell = join(dir, "_shell.html");
  writeFileSync(
    shell,
    readFileSync(shell, "utf8").replace("<head>", '<head><meta name="pfa-build" content="next">'),
  );
  buildPrecache(dir);
  return dir;
}

async function waitUntilControlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test.beforeEach(async ({ page }) => {
  await serve(page, BUILT);
});

test("launches offline after the first visit", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Personal finance" })).toBeVisible();
  await waitUntilControlled(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Personal finance" })).toBeVisible();
});

test("opens a deep link offline from the cached shell", async ({ page, context }) => {
  await page.goto("/");
  await waitUntilControlled(page);

  await context.setOffline(true);
  await page.goto("/some/deep/link");
  await expect(page.locator("body")).not.toBeEmpty();
  expect(await page.evaluate(() => document.title)).toBe("Personal finance");
});

test("offers a new version without interrupting the session, and applies it on request", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitUntilControlled(page);
  await page.evaluate(() => {
    (window as unknown as { session: number }).session = 42;
  });

  await serve(page, nextRelease());
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
  });

  await expect(page.getByRole("status")).toContainText("A new version is ready");
  // Still the same page, the same session, and still the old version.
  expect(await page.evaluate(() => (window as unknown as { session: number }).session)).toBe(42);
  await expect(page.locator('meta[name="pfa-build"]')).toHaveCount(0);

  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Reload" }).click(),
  ]);
  await expect(page.locator('meta[name="pfa-build"]')).toHaveCount(1);
  expect(
    await page.evaluate(() => (window as unknown as { session?: number }).session),
  ).toBeUndefined();

  // And the new version works offline too.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('meta[name="pfa-build"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Personal finance" })).toBeVisible();
});

test("is installable: a manifest with icons the browser can load", async ({ page }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await page.request.get(href!)).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
});

test("the test server refuses to serve folders outside the build and temp dirs", async ({
  page,
}) => {
  const response = await page.request.post(`/__site?dir=${encodeURIComponent("/etc")}`, {
    headers: { "x-pfa-test": "1" },
  });
  expect(response.status()).toBe(403);
  const traversal = await page.request.get("/../../../../etc/hosts");
  expect(await traversal.text()).not.toContain("localhost");
});

test("the test server only accepts site swaps from the tests themselves", async ({ page }) => {
  const withoutHeader = await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`);
  expect(withoutHeader.status()).toBe(403);
});

test("a missing asset is a 404, not the app shell, as on real hosting", async ({ page }) => {
  const response = await page.request.get("/assets/does-not-exist.js");
  expect(response.status()).toBe(404);
  const route = await page.request.get("/some/client/route");
  expect(route.status()).toBe(200);
  expect(await route.text()).toContain("<html");
});
