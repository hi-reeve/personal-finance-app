// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { Amount } from "./amount";
import { HideAmountsProvider, HideAmountsToggle } from "./hide-amounts";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

describe("Amount", () => {
  it("shows an expense in a list with a minus sign and an icon, in plain ink", () => {
    const { container } = render(
      <Amount direction="expense" variant="list" formatted="Rp 25.000" />,
    );

    expect(screen.getByText("−")).toBeTruthy();
    expect(screen.getByText("Rp 25.000")).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByLabelText("Expense Rp 25.000")).toBeTruthy();
    expect(container.querySelector("[data-tone]")).toBeNull();
    const amount = screen.getByLabelText("Expense Rp 25.000");
    expect(amount.className).toContain("text-ink");
    expect(amount.className).not.toMatch(/text-(income|expense)/);
  });

  it("shows income with a plus sign and its own icon", () => {
    render(<Amount direction="income" variant="list" formatted="Rp 1.000.000" />);
    expect(screen.getByText("+")).toBeTruthy();
    expect(screen.getByLabelText("Income Rp 1.000.000")).toBeTruthy();
  });

  it("colours totals, but never by colour alone: the sign and icon stay", () => {
    const { container } = render(
      <Amount direction="expense" variant="total" formatted="Rp 25.000" />,
    );

    expect(container.querySelector("[data-tone='expense']")).not.toBeNull();
    expect(screen.getByLabelText("Expense Rp 25.000").className).toContain("text-expense");
    expect(screen.getByText("−")).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
  });

  it("shows a neutral amount without a sign or colour", () => {
    const { container } = render(
      <Amount direction="neutral" variant="total" formatted="Rp 5.000" />,
    );
    expect(screen.queryByText("+")).toBeNull();
    expect(screen.queryByText("−")).toBeNull();
    expect(container.querySelector("[data-tone]")).toBeNull();
  });
});

describe("hide amounts", () => {
  it("replaces every amount with dots and reveals no digits", () => {
    render(
      <HideAmountsProvider initialHidden>
        <Amount direction="expense" variant="list" formatted="Rp 25.000" />
      </HideAmountsProvider>,
    );

    expect(screen.queryByText("Rp 25.000")).toBeNull();
    expect(screen.getByText("••••••")).toBeTruthy();
    expect(screen.getByLabelText("Amount hidden")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/25/);
  });

  it("is switched by the toggle, which reports its state, and the choice is remembered on this device", () => {
    const view = render(
      <HideAmountsProvider>
        <HideAmountsToggle />
        <Amount direction="income" variant="list" formatted="Rp 9.000" />
      </HideAmountsProvider>,
    );
    const toggle = screen.getByRole("button", { name: /hide amounts/i });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Rp 9.000")).toBeNull();

    view.unmount();
    render(
      <HideAmountsProvider>
        <Amount direction="income" variant="list" formatted="Rp 9.000" />
      </HideAmountsProvider>,
    );
    expect(screen.queryByText("Rp 9.000")).toBeNull();
  });
});
