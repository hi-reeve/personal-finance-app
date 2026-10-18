// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { AppearanceControls, AppearanceProvider } from "./appearance";

const root = () => document.documentElement;

function mount() {
  return render(
    <AppearanceProvider>
      <AppearanceControls />
    </AppearanceProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  for (const attr of ["data-theme", "data-accent", "data-colors"]) root().removeAttribute(attr);
});
afterEach(cleanup);

describe("appearance", () => {
  it("follows the system by default and applies no explicit choice", () => {
    mount();
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(root().hasAttribute("data-accent")).toBe(false);
    expect(root().hasAttribute("data-colors")).toBe(false);
  });

  it("switches the theme between light, dark and system", async () => {
    mount();
    fireEvent.click(screen.getByLabelText("Dark"));
    await waitFor(() => expect(root().getAttribute("data-theme")).toBe("dark"));
    fireEvent.click(screen.getByLabelText("Light"));
    await waitFor(() => expect(root().getAttribute("data-theme")).toBe("light"));
    fireEvent.click(screen.getByLabelText("System"));
    await waitFor(() => expect(root().hasAttribute("data-theme")).toBe(false));
  });

  it("changes the accent colour and the colour-blind-safe preset", async () => {
    mount();
    fireEvent.click(screen.getByLabelText("Teal"));
    await waitFor(() => expect(root().getAttribute("data-accent")).toBe("teal"));
    fireEvent.click(screen.getByLabelText("Colour-blind safe"));
    await waitFor(() => expect(root().getAttribute("data-colors")).toBe("colorblind"));
  });

  it("remembers the choices on this device after a reload", async () => {
    const first = mount();
    fireEvent.click(screen.getByLabelText("Dark"));
    await waitFor(() => expect(root().getAttribute("data-theme")).toBe("dark"));
    fireEvent.click(screen.getByLabelText("Plum"));
    await waitFor(() => expect(root().getAttribute("data-accent")).toBe("plum"));
    fireEvent.click(screen.getByLabelText("Colour-blind safe"));
    await waitFor(() => expect(root().getAttribute("data-colors")).toBe("colorblind"));
    first.unmount();
    for (const attr of ["data-theme", "data-accent", "data-colors"]) root().removeAttribute(attr);

    mount();
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().getAttribute("data-accent")).toBe("plum");
    expect(root().getAttribute("data-colors")).toBe("colorblind");
    expect((screen.getByLabelText("Dark") as HTMLInputElement).checked).toBe(true);
  });

  it("ignores unreadable stored data", () => {
    localStorage.setItem("pfa.appearance", "{not json");
    mount();
    expect(root().hasAttribute("data-theme")).toBe(false);
  });
});
