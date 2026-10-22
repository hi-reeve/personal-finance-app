// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { DEVICE_STORAGE_KEYS } from "../settings/scopes";
import { useDisplayCurrency } from "./display-currency";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("display currency", () => {
  it("starts as none and is remembered on this device only", () => {
    const { result, unmount } = renderHook(() => useDisplayCurrency());
    expect(result.current[0]).toBeUndefined();
    act(() => result.current[1]("EUR"));
    expect(result.current[0]).toBe("EUR");
    expect(localStorage.getItem(DEVICE_STORAGE_KEYS.displayCurrency)).toBe("EUR");
    unmount();
    expect(renderHook(() => useDisplayCurrency()).result.current[0]).toBe("EUR");
  });

  it("can be turned off again, and ignores a stored value that is not a currency", () => {
    localStorage.setItem(DEVICE_STORAGE_KEYS.displayCurrency, "EUR");
    const { result } = renderHook(() => useDisplayCurrency());
    act(() => result.current[1](undefined));
    expect(localStorage.getItem(DEVICE_STORAGE_KEYS.displayCurrency)).toBeNull();
    localStorage.setItem(DEVICE_STORAGE_KEYS.displayCurrency, "nonsense");
    expect(renderHook(() => useDisplayCurrency()).result.current[0]).toBeUndefined();
  });
});
