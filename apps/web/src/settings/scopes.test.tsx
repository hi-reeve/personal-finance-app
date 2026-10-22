// @vitest-environment jsdom
import { createEngine, createMemoryStore } from "@pfa/core";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { AppearanceProvider, useAppearance } from "../components/appearance";
import { HideAmountsProvider, useHideAmounts } from "../components/hide-amounts";
import { LocaleProvider, useLocale } from "../components/locale";
import { DEVICE_STORAGE_KEYS, SETTING_SCOPES } from "./scopes";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const synced = Object.entries(SETTING_SCOPES)
  .filter(([, scope]) => scope === "synced")
  .map(([key]) => key);
const device = Object.entries(SETTING_SCOPES)
  .filter(([, scope]) => scope === "device")
  .map(([key]) => key);

describe("synced settings", () => {
  it("are written to the shared log, and they are exactly the ones marked synced", async () => {
    const engine = await createEngine({
      deviceId: "dev-a",
      clock: { now: () => 1_700_000_000_000 },
      random: { bytes: (n) => crypto.getRandomValues(new Uint8Array(n)) },
      store: createMemoryStore(),
    });
    await engine.setPreferences({
      numberFormat: "dot-comma",
      dateFormat: "iso",
      budgetNearLimit: 85,
      budgetStartDay: 25,
    });
    const logged = (await engine.exportOps()).map((op) => op.field).sort();
    expect(logged).toEqual([...synced].sort());
  });
});

describe("device-local settings", () => {
  function Controls({ run }: { run: (api: Api) => void }) {
    const appearance = useAppearance();
    const hide = useHideAmounts();
    const locale = useLocale();
    useEffect(() => run({ appearance, hide, locale }));
    return null;
  }
  type Api = {
    appearance: ReturnType<typeof useAppearance>;
    hide: ReturnType<typeof useHideAmounts>;
    locale: ReturnType<typeof useLocale>;
  };

  it("stay in this browser's storage, each under its own key", async () => {
    let api!: Api;
    render(
      <AppearanceProvider>
        <LocaleProvider>
          <HideAmountsProvider>
            <Controls
              run={(a) => {
                api = a;
              }}
            />
          </HideAmountsProvider>
        </LocaleProvider>
      </AppearanceProvider>,
    );
    await act(async () => {
      api.appearance.setAppearance({ theme: "dark", accent: "teal", colors: "colorblind" });
      api.hide.setStart("hidden");
      api.locale.setLanguage("id");
    });

    expect(JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEYS.theme)!)).toEqual({
      theme: "dark",
      accent: "teal",
      colors: "colorblind",
    });
    expect(localStorage.getItem(DEVICE_STORAGE_KEYS.hideAmountsStart)).toBe("hidden");
    expect(localStorage.getItem(DEVICE_STORAGE_KEYS.language)).toBe("id");
    // Every device-local setting has a storage key, and no synced one does.
    expect(Object.keys(DEVICE_STORAGE_KEYS).sort()).toEqual([...device].sort());
    expect(synced.some((key) => key in DEVICE_STORAGE_KEYS)).toBe(false);
  });
});

describe("hide amounts when the app opens", () => {
  function State() {
    return <p data-testid="state">{useHideAmounts().hidden ? "hidden" : "shown"}</p>;
  }
  const opened = (start: string | null, remembered: string | null) => {
    if (start) localStorage.setItem("pfa.hideAmountsStart", start);
    if (remembered) localStorage.setItem("pfa.hideAmounts", remembered);
    const view = render(
      <HideAmountsProvider>
        <State />
      </HideAmountsProvider>,
    );
    const text = view.getByTestId("state").textContent;
    view.unmount();
    localStorage.clear();
    return text;
  };

  it("remembers the last choice by default", () => {
    expect(opened(null, "1")).toBe("hidden");
    expect(opened(null, "0")).toBe("shown");
    expect(opened(null, null)).toBe("shown");
  });

  it("can always start hidden, or always shown, whatever was left last time", () => {
    expect(opened("hidden", "0")).toBe("hidden");
    expect(opened("shown", "1")).toBe("shown");
  });

  it("carries a toggle over to next time while it remembers", () => {
    function Toggler() {
      const hide = useHideAmounts();
      useEffect(() => hide.toggle(), []);
      return null;
    }
    render(
      <HideAmountsProvider>
        <Toggler />
      </HideAmountsProvider>,
    );
    expect(localStorage.getItem("pfa.hideAmounts")).toBe("1");
  });

  it("does not carry a toggle over to next time once the start is fixed", () => {
    function Toggler() {
      const hide = useHideAmounts();
      useEffect(() => hide.toggle(), []);
      return null;
    }
    localStorage.setItem("pfa.hideAmountsStart", "shown");
    render(
      <HideAmountsProvider>
        <Toggler />
      </HideAmountsProvider>,
    );
    expect(localStorage.getItem("pfa.hideAmounts")).toBeNull();
  });
});
