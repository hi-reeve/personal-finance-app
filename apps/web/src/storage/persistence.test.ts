// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readPersistenceOutcome, requestPersistence } from "./persistence";

function stubStorage(storage: unknown) {
  vi.stubGlobal("navigator", { storage });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("requestPersistence", () => {
  it("asks the browser and records a grant", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubStorage({ persist, persisted: vi.fn().mockResolvedValue(false) });
    expect(await requestPersistence(() => 42)).toEqual({ status: "granted", checkedAt: 42 });
    expect(persist).toHaveBeenCalledOnce();
    expect(readPersistenceOutcome()).toEqual({ status: "granted", checkedAt: 42 });
  });

  it("does not ask again when storage is already persistent", async () => {
    const persist = vi.fn();
    stubStorage({ persist, persisted: vi.fn().mockResolvedValue(true) });
    expect((await requestPersistence(() => 1)).status).toBe("granted");
    expect(persist).not.toHaveBeenCalled();
  });

  it("records a refusal", async () => {
    stubStorage({
      persist: vi.fn().mockResolvedValue(false),
      persisted: vi.fn().mockResolvedValue(false),
    });
    expect((await requestPersistence(() => 7)).status).toBe("denied");
    expect(readPersistenceOutcome()).toEqual({ status: "denied", checkedAt: 7 });
  });

  it("records when the browser has no storage API", async () => {
    stubStorage(undefined);
    expect((await requestPersistence(() => 3)).status).toBe("unsupported");
  });

  it("survives a browser that throws", async () => {
    stubStorage({
      persist: vi.fn().mockRejectedValue(new Error("blocked")),
      persisted: vi.fn().mockResolvedValue(false),
    });
    const outcome = await requestPersistence(() => 5);
    expect(outcome).toEqual({ status: "error", checkedAt: 5, message: "blocked" });
  });

  it("ignores a damaged record", () => {
    localStorage.setItem("pfa.persistence", '{"status":"granted"}');
    expect(readPersistenceOutcome()).toBeUndefined();
  });
});
