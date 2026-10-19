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
