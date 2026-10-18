// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { APPEARANCE_INIT_SCRIPT, AppearanceControls, AppearanceProvider } from "./appearance";

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

  it("marks the selected choice with a check as well as a fill", async () => {
    mount();
    const labelOf = (name: string) => screen.getByLabelText(name).closest("label")!;
    expect(labelOf("System").querySelector("svg")).not.toBeNull();
    expect(labelOf("Dark").querySelector("svg")).toBeNull();

    fireEvent.click(screen.getByLabelText("Dark"));
    await waitFor(() => expect(labelOf("Dark").querySelector("svg")).not.toBeNull());
    expect(labelOf("System").querySelector("svg")).toBeNull();
  });

  it("still applies a choice when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mount();
    fireEvent.click(screen.getByLabelText("Dark"));
    await waitFor(() => expect(root().getAttribute("data-theme")).toBe("dark"));
    vi.restoreAllMocks();
  });
});

describe("the script that runs before first paint", () => {
  const run = () => new Function(APPEARANCE_INIT_SCRIPT)();

  it("applies a saved choice", () => {
    localStorage.setItem(
      "pfa.appearance",
      JSON.stringify({ theme: "dark", accent: "sage", colors: "colorblind" }),
    );
    run();
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().getAttribute("data-accent")).toBe("sage");
    expect(root().getAttribute("data-colors")).toBe("colorblind");
  });

  it("ignores values it does not recognise and unreadable data", () => {
    localStorage.setItem(
      "pfa.appearance",
      JSON.stringify({ theme: "neon", accent: "<script>", colors: 7 }),
    );
    run();
    expect(root().hasAttribute("data-theme")).toBe(false);
    expect(root().hasAttribute("data-accent")).toBe(false);
    expect(root().hasAttribute("data-colors")).toBe(false);

    localStorage.setItem("pfa.appearance", "{not json");
    expect(run).not.toThrow();
  });
});
