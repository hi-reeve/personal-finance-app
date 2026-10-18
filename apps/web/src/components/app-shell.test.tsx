// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { AppShell } from "./app-shell";
import { LocaleProvider } from "./locale";
import { ALL_PATHS } from "./nav-items";

async function mount(path = "/") {
  window.history.pushState({}, "", path);
  const root = createRootRoute({
    component: () => (
      <LocaleProvider>
        <AppShell>
          <input aria-label="Note" />
          <p>page body</p>
        </AppShell>
      </LocaleProvider>
    ),
  });
  const routes = ALL_PATHS.map((to) => createRoute({ getParentRoute: () => root, path: to }));
  const router = createRouter({
    routeTree: root.addChildren(routes),
  });
  render(<RouterProvider router={router} />);
  await screen.findByText("page body");
}

const nav = (layout: "phone" | "rail" | "sidebar") =>
  document.querySelector<HTMLElement>(`[data-nav="${layout}"]`)!;
const names = (el: HTMLElement) =>
  within(el)
    .queryAllByRole("link")
    .concat(within(el).queryAllByRole("button"))
    .map((e) => e.textContent?.trim() || e.getAttribute("aria-label"));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("navigation layouts", () => {
  it("phone bar: Home, Activity, a centre Add, Plan, More", async () => {
    await mount();
    const items = [...nav("phone").querySelectorAll("a, button")].map((e) => e.textContent?.trim());
    expect(items).toEqual(["Home", "Activity", "Add", "Plan", "More"]);
  });

  it("tablet rail: labelled destinations and no Add", async () => {
    await mount();
    expect(names(nav("rail"))).toEqual(["Home", "Activity", "Plan", "More"]);
  });

  it("desktop sidebar: grouped destinations with Settings last and no Add", async () => {
    await mount();
    const sidebar = nav("sidebar");
    expect(names(sidebar)).toEqual([
      "Home",
      "Activity",
      "Budgets",
      "Recurring & bills",
      "Accounts",
      "Debts & loans",
      "Split bill",
      "Reports",
      "Settings",
    ]);
    const headings = within(sidebar)
      .getAllByRole("heading")
      .map((h) => h.textContent);
    expect(headings).toEqual(["Plan", "Money", "Insights"]);
  });

  it("phone and tablet offer the same destinations", async () => {
    await mount();
    const hrefs = (layout: "phone" | "rail" | "sidebar") =>
      new Set([...nav(layout).querySelectorAll("a")].map((a) => a.getAttribute("href")));
    expect(hrefs("phone")).toEqual(hrefs("rail"));
  });

  it("marks the current page for screen readers, and Plan stays current on Recurring", async () => {
    await mount("/recurring");
    await waitFor(() =>
      expect(within(nav("phone")).getByRole("link", { current: "page" }).textContent).toBe("Plan"),
    );
    expect(within(nav("sidebar")).getByRole("link", { current: "page" }).textContent).toBe(
      "Recurring & bills",
    );
  });

  it("leaves room under the content for the floating Add", async () => {
    await mount();
    expect(screen.getByRole("main").className).toMatch(/pb-/);
  });
});

describe("Add", () => {
  it("opens from the phone bar, and closes with Escape", async () => {
    await mount();
    fireEvent.click(within(nav("phone")).getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog", { name: "Add transaction" });
    expect(dialog).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens from the floating button, which lives outside every nav", async () => {
    await mount();
    const floating = screen.getAllByRole("button", { name: "Add transaction" })[0]!;
    expect(floating.closest("nav")).toBeNull();
    fireEvent.click(floating);
    expect(await screen.findByRole("dialog", { name: "Add transaction" })).toBeTruthy();
  });

  it("opens with the N shortcut, but not while typing or with a modifier", async () => {
    await mount();
    const field = screen.getByLabelText("Note");
    field.focus();
    fireEvent.keyDown(field, { key: "n" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(document.body, { key: "n", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "n", metaKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(document.body, { key: "n" });
    expect(await screen.findByRole("dialog", { name: "Add transaction" })).toBeTruthy();
  });
});
