import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function device(store = createMemoryStore(), id = "dev-a") {
  const clock = createManualClock(NOW);
  const engine = await createEngine({
    deviceId: id,
    clock,
    random: createSeededRandom(id === "dev-a" ? 1 : 2),
    store,
  });
  return { engine, clock, store };
}

describe("synced preferences", () => {
  it("start unset, so each device falls back to its own locale", async () => {
    const { engine } = await device();
    expect(engine.getSettings().numberFormat).toBeUndefined();
    expect(engine.getSettings().dateFormat).toBeUndefined();
  });

  it("are stored in the synced log, and nothing else is written", async () => {
    const { engine } = await device();
    await engine.setPreferences({ numberFormat: "dot-comma", dateFormat: "iso" });

    expect(engine.getSettings()).toMatchObject({ numberFormat: "dot-comma", dateFormat: "iso" });
    const ops = await engine.exportOps();
    expect(ops.map((op) => [op.entity, op.field, op.value]).sort()).toEqual([
      ["settings", "dateFormat", "iso"],
      ["settings", "numberFormat", "dot-comma"],
    ]);
  });

  it("change one at a time and survive a restart", async () => {
    const first = await device();
    await first.engine.setPreferences({ numberFormat: "comma-dot" });
    await first.engine.setPreferences({ dateFormat: "day-month-year" });
    await first.engine.setPreferences({ numberFormat: "dot-comma" });

    const restarted = await device(first.store);
    expect(restarted.engine.getSettings()).toMatchObject({
      numberFormat: "dot-comma",
      dateFormat: "day-month-year",
    });
  });

  it("reach another device, and the later change wins", async () => {
    const one = await device(undefined, "dev-a");
    const two = await device(undefined, "dev-b");
    await one.engine.setPreferences({ dateFormat: "iso" });
    two.clock.advance(1_000);
    await two.engine.setPreferences({ dateFormat: "month-day-year", numberFormat: "comma-dot" });

    await one.engine.applyOps(await two.engine.exportOps());
    await two.engine.applyOps(await one.engine.exportOps());
    for (const { engine } of [one, two]) {
      expect(engine.getSettings()).toMatchObject({
        dateFormat: "month-day-year",
        numberFormat: "comma-dot",
      });
    }
  });

  it("sit beside first-run setup without disturbing it", async () => {
    const { engine } = await device();
    await engine.setPreferences({ numberFormat: "dot-comma" });
    await engine.completeSetup({
      baseCurrency: "IDR",
      account: { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 },
    });
    expect(engine.getSettings()).toMatchObject({ baseCurrency: "IDR", numberFormat: "dot-comma" });
  });

  it("refuse a value that is not one of the choices, and write nothing", async () => {
    const { engine } = await device();
    await expect(engine.setPreferences({ numberFormat: "1 234,5" as never })).rejects.toThrow();
    await expect(
      engine.setPreferences({ dateFormat: "iso", numberFormat: "nope" as never }),
    ).rejects.toThrow();
    expect(await engine.exportOps()).toEqual([]);
  });
});
