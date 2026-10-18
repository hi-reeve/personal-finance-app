import { describe, expect, it } from "vite-plus/test";
import { createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function device(deviceId: string, seed = 1, startMs = 1_700_000_000_000) {
  const clock = createManualClock(startMs);
  const engine = await createEngine({
    deviceId,
    clock,
    random: createSeededRandom(seed),
    store: createMemoryStore(),
  });
  return { engine, clock };
}

describe("recording a Transaction", () => {
  it("reads back what was recorded, with UUIDv7 ids and a total derived from its Lines", async () => {
    const { engine } = await device("dev-a");

    const recorded = await engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      time: "23:40",
      payee: "Warung Bu Sari",
      lines: [{ categoryId: "cat-food", amount: 25_000 }],
    });

    const read = await engine.getTransaction(recorded.id);
    expect(read).toEqual({
      id: recorded.id,
      accountId: "acc-1",
      date: "2026-10-17",
      time: "23:40",
      payee: "Warung Bu Sari",
      lines: [{ id: recorded.lines[0]!.id, categoryId: "cat-food", amount: 25_000 }],
      total: 25_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
    expect(recorded.id).toMatch(UUID_V7);
    expect(recorded.lines[0]!.id).toMatch(UUID_V7);
  });
});

describe("editing a Transaction", () => {
  it("changes fields and keeps the total in step with its Lines", async () => {
    const { engine, clock } = await device("dev-a");
    const recorded = await engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      lines: [{ categoryId: "cat-food", amount: 25_000 }],
    });

    clock.advance(1_000);
    await engine.editTransaction(recorded.id, { date: "2026-10-18", note: "lunch" });
    await engine.editLine(recorded.id, recorded.lines[0]!.id, {
      amount: 30_000,
      categoryId: "cat-eating-out",
    });

    const read = await engine.getTransaction(recorded.id);
    expect(read).toMatchObject({
      date: "2026-10-18",
      note: "lunch",
      lines: [{ categoryId: "cat-eating-out", amount: 30_000 }],
      total: 30_000,
    });
  });
});

describe("deleting a Transaction", () => {
  it("hides it from reads and lists", async () => {
    const { engine, clock } = await device("dev-a");
    const keep = await engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      lines: [{ categoryId: "cat-food", amount: 1_000 }],
    });
    const drop = await engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      lines: [{ categoryId: "cat-food", amount: 2_000 }],
    });

    clock.advance(1_000);
    await engine.deleteTransaction(drop.id);

    expect(await engine.getTransaction(drop.id)).toBeUndefined();
    expect((await engine.listTransactions()).map((t) => t.id)).toEqual([keep.id]);
  });
});

describe("rejecting invalid input", () => {
  const line = { categoryId: "cat-food", amount: 1_000 };
  const base = { accountId: "acc-1", date: "2026-10-17", lines: [line] };

  it.each([
    ["a date that is not YYYY-MM-DD", { ...base, date: "17/10/2026" }],
    ["a calendar date that does not exist", { ...base, date: "2026-02-30" }],
    ["a time that is not HH:mm", { ...base, time: "25:61" }],
    ["an amount that is not whole minor units", { ...base, lines: [{ ...line, amount: 10.5 }] }],
    ["a Transaction with no Lines", { ...base, lines: [] }],
  ])("refuses %s and records nothing", async (_name, input) => {
    const { engine } = await device("dev-a");
    await expect(engine.recordTransaction(input)).rejects.toThrow();
    expect(await engine.listTransactions()).toEqual([]);
  });

  it("refuses an edit to an invalid date and keeps the old one", async () => {
    const { engine } = await device("dev-a");
    const recorded = await engine.recordTransaction(base);
    await expect(engine.editTransaction(recorded.id, { date: "2026-00-10" })).rejects.toThrow();
    expect((await engine.getTransaction(recorded.id))?.date).toBe("2026-10-17");
  });
});

describe("two devices exchanging their op logs", () => {
  async function scenario() {
    const a = await device("dev-a", 11);
    const b = await device("dev-b", 22);
    const shared = await a.engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      lines: [{ categoryId: "cat-food", amount: 10_000 }],
    });
    await b.engine.applyOps(await a.engine.exportOps());

    // Concurrent: A edits the note and amount, B edits the note and deletes a second Transaction.
    a.clock.advance(1_000);
    b.clock.advance(2_000);
    await a.engine.editTransaction(shared.id, { note: "from A" });
    await a.engine.editLine(shared.id, shared.lines[0]!.id, { amount: 12_000 });
    await b.engine.editTransaction(shared.id, { note: "from B" });
    const extra = await a.engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-18",
      lines: [{ categoryId: "cat-food", amount: 500 }],
    });
    a.clock.advance(5_000);
    await a.engine.deleteTransaction(extra.id);
    return { a, b, shared };
  }

  it("converges to the same state whichever order the ops arrive in", async () => {
    const first = await scenario();

    const aOps = await first.a.engine.exportOps();
    const bOps = await first.b.engine.exportOps();
    await first.a.engine.applyOps(bOps);
    await first.b.engine.applyOps(aOps);

    // Same ops delivered to a fresh device in the opposite order.
    const fresh = await device("dev-c", 33);
    await fresh.engine.applyOps([...bOps].reverse());
    await fresh.engine.applyOps([...aOps].reverse());

    const stateA = await first.a.engine.listTransactions();
    expect(await first.b.engine.listTransactions()).toEqual(stateA);
    expect(await fresh.engine.listTransactions()).toEqual(stateA);
  });

  it("lets the later edit win a concurrent conflict, and keeps independent fields", async () => {
    const { a, b, shared } = await scenario();
    await a.engine.applyOps(await b.engine.exportOps());
    await b.engine.applyOps(await a.engine.exportOps());

    const merged = await a.engine.getTransaction(shared.id);
    expect(merged?.note).toBe("from B"); // B's clock was two seconds ahead of A's edit
    expect(merged?.total).toBe(12_000); // only A touched the amount
  });

  it("ignores an op it has already seen", async () => {
    const { a, b, shared } = await scenario();
    const ops = await a.engine.exportOps();
    await b.engine.applyOps(ops);
    await b.engine.applyOps(ops);
    expect((await b.engine.getTransaction(shared.id))?.total).toBe(12_000);
    expect((await b.engine.exportOps()).length).toBe(
      new Set((await b.engine.exportOps()).map((o) => o.id)).size,
    );
  });

  it("orders a device's next edit after ops it has received from a device whose clock runs ahead", async () => {
    const a = await device("dev-a", 11, 1_700_000_000_000);
    const b = await device("dev-b", 22, 1_700_000_900_000); // B's clock is 15 minutes fast
    const t = await b.engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      note: "B's original",
      lines: [{ categoryId: "cat-food", amount: 1 }],
    });
    await a.engine.applyOps(await b.engine.exportOps());
    await a.engine.editTransaction(t.id, { note: "A edits after receiving B's record" });
    await b.engine.applyOps(await a.engine.exportOps());
    expect((await b.engine.getTransaction(t.id))?.note).toBe("A edits after receiving B's record");
  });

  it("breaks an exact timestamp tie the same way on every device", async () => {
    const a = await device("dev-a", 11);
    const b = await device("dev-b", 22);
    const t = await a.engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      note: "original",
      lines: [{ categoryId: "cat-food", amount: 1 }],
    });
    await b.engine.applyOps(await a.engine.exportOps());

    a.clock.advance(1_000);
    b.clock.advance(1_000);
    await a.engine.editTransaction(t.id, { note: "from A" });
    await b.engine.editTransaction(t.id, { note: "from B" });
    await a.engine.applyOps(await b.engine.exportOps());
    await b.engine.applyOps(await a.engine.exportOps());

    const onA = (await a.engine.getTransaction(t.id))?.note;
    const onB = (await b.engine.getTransaction(t.id))?.note;
    expect(onA).toBe(onB);
  });
});

describe("machine times", () => {
  it("stamps createdAt at recording and updatedAt at the latest edit, in epoch ms", async () => {
    const { engine, clock } = await device("dev-a", 1, 1_700_000_000_000);
    const recorded = await engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      lines: [{ categoryId: "cat-food", amount: 1_000 }],
    });
    expect(recorded.createdAt).toBe(1_700_000_000_000);
    expect(recorded.updatedAt).toBe(1_700_000_000_000);

    clock.advance(60_000);
    await engine.editLine(recorded.id, recorded.lines[0]!.id, { amount: 2_000 });
    const read = await engine.getTransaction(recorded.id);
    expect(read?.createdAt).toBe(1_700_000_000_000);
    expect(read?.updatedAt).toBe(1_700_000_060_000);
  });
});

describe("a device that restarts", () => {
  it("keeps ordering its edits after what it already stored, even if its clock went backwards", async () => {
    const store = createMemoryStore();
    const first = await createEngine({
      deviceId: "dev-a",
      clock: createManualClock(1_700_000_900_000),
      random: createSeededRandom(1),
      store,
    });
    const t = await first.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      note: "before restart",
      lines: [{ categoryId: "cat-food", amount: 1 }],
    });

    const afterRestart = await createEngine({
      deviceId: "dev-a",
      clock: createManualClock(1_700_000_000_000), // clock now 15 minutes behind the stored ops
      random: createSeededRandom(2),
      store,
    });
    await afterRestart.editTransaction(t.id, { note: "after restart" });
    expect((await afterRestart.getTransaction(t.id))?.note).toBe("after restart");
  });
});

describe("records that do not exist or are deleted", () => {
  const base = {
    accountId: "acc-1",
    date: "2026-10-17",
    lines: [{ categoryId: "cat-food", amount: 1 }],
  };

  it("refuses to edit or delete an unknown Transaction and leaves no trace", async () => {
    const { engine } = await device("dev-a");
    await expect(engine.editTransaction("nope", { note: "x" })).rejects.toThrow();
    await expect(engine.deleteTransaction("nope")).rejects.toThrow();
    expect(await engine.listTransactions()).toEqual([]);
  });

  it("refuses to edit a deleted Transaction", async () => {
    const { engine } = await device("dev-a");
    const t = await engine.recordTransaction(base);
    await engine.deleteTransaction(t.id);
    await expect(engine.editTransaction(t.id, { note: "x" })).rejects.toThrow();
  });

  it("refuses to edit a Line through the wrong Transaction", async () => {
    const { engine } = await device("dev-a");
    const t1 = await engine.recordTransaction(base);
    const t2 = await engine.recordTransaction(base);
    await expect(engine.editLine(t2.id, t1.lines[0]!.id, { amount: 5 })).rejects.toThrow();
  });
});

describe("a delete racing an edit", () => {
  it("converges on both devices whichever happened later", async () => {
    const a = await device("dev-a", 11);
    const b = await device("dev-b", 22);
    const t = await a.engine.recordTransaction({
      accountId: "acc-1",
      date: "2026-10-17",
      lines: [{ categoryId: "cat-food", amount: 1 }],
    });
    await b.engine.applyOps(await a.engine.exportOps());

    a.clock.advance(1_000);
    b.clock.advance(2_000);
    await a.engine.editTransaction(t.id, { note: "edited on A" });
    await b.engine.deleteTransaction(t.id);
    await a.engine.applyOps(await b.engine.exportOps());
    await b.engine.applyOps(await a.engine.exportOps());

    expect(await a.engine.listTransactions()).toEqual(await b.engine.listTransactions());
    expect(await a.engine.getTransaction(t.id)).toBeUndefined();
  });
});
