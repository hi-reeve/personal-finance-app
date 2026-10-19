import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const BUILT = resolve("dist/client");

test.beforeEach(async ({ page }) => {
  await page.request.post(`/__site?dir=${encodeURIComponent(BUILT)}`, {
    headers: { "x-pfa-test": "1" },
  });
});

test("records written through core survive a reload, and the persistence request is recorded", async ({
  page,
}) => {
  await page.goto("/settings");
  const count = page.getByRole("status").filter({ hasText: "check records" });
  await expect(count).toContainText("0 check records");

  await page.getByRole("button", { name: "Run storage check" }).click();
  await expect(count).toContainText("1 check records");
  await page.getByRole("button", { name: "Run storage check" }).click();
  await expect(count).toContainText("2 check records");

  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "check records" })).toContainText(
    "2 check records",
  );

  const outcome = page.getByTestId("persistence");
  await expect(outcome).not.toHaveAttribute("data-status", "pending");
  const recorded = await page.evaluate(() => localStorage.getItem("pfa.persistence"));
  expect(JSON.parse(recorded!)).toMatchObject({
    status: expect.stringMatching(/^(granted|denied|unsupported)$/),
  });
});

test("a second tab is told the data is open elsewhere instead of touching it", async ({
  page,
  context,
}) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Run storage check" }).click();
  await expect(page.getByRole("status").filter({ hasText: "check records" })).toContainText("1");

  const second = await context.newPage();
  await second.goto("/settings");
  await expect(second.getByRole("alert")).toContainText("Another tab already has your data open");

  // The first tab's data is untouched, and a reload there still reads it.
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "check records" })).toContainText("1");
});

test("persistence is requested at start-up, not only when Settings is opened", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("pfa.persistence")))
    .not.toBeNull();
});
