// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { PwaBanner } from "./pwa-banner";

afterEach(cleanup);

describe("PwaBanner", () => {
  it("shows nothing when there is nothing to offer", () => {
    const { container } = render(
      <PwaBanner updateReady={false} canInstall={false} onApply={vi.fn()} onInstall={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });

  it("offers the new version, and applies it only when asked", () => {
    const onApply = vi.fn();
    render(<PwaBanner updateReady canInstall={false} onApply={onApply} onInstall={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toMatch(/new version/i);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("offers to install the app when the browser allows it", () => {
    const onInstall = vi.fn();
    render(<PwaBanner updateReady={false} canInstall onApply={vi.fn()} onInstall={onInstall} />);
    fireEvent.click(screen.getByRole("button", { name: /install app/i }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });
});
