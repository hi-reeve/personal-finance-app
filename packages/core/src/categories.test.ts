import { describe, expect, it } from "vite-plus/test";
import { BALANCE_ADJUSTMENT_CATEGORY, createEngine, createMemoryStore } from "./index";
import { createManualClock, createSeededRandom } from "./testing";

const NOW = 1_700_000_000_000;

async function device(store = createMemoryStore(), name = "dev-a", seed = 1) {
  const clock = createManualClock(NOW);
  const engine = await createEngine({
    deviceId: name,
    clock,
    random: createSeededRandom(seed),
    store,
  });
  return { engine, clock, store };
}

const wallet = { name: "Dompet", kind: "cash", currency: "IDR", openingBalance: 0 } as const;

async function withAccount() {
  const d = await device();
  const account = await d.engine.createAccount(wallet);
  return { ...d, account };
}

describe("Category tree", () => {
  it("nests to any depth and reports each Category's parent", async () => {
    const { engine } = await device();
    const food = await engine.createCategory({ name: "Food", kind: "expense" });
    const groceries = await engine.createCategory({
      name: "Groceries",
      kind: "expense",
      parentId: food.id,
    });
    const fruit = await engine.createCategory({
      name: "Fruit",
      kind: "expense",
      parentId: groceries.id,
    });

    expect(food.parentId).toBeUndefined();
    expect(fruit.parentId).toBe(groceries.id);
    expect((await engine.listCategories()).map((c) => c.name)).toEqual([
      "Food",
      "Groceries",
      "Fruit",
    ]);
  });

  it("trims names, rejects blanks, and keeps a child the same kind as its parent", async () => {
    const { engine } = await device();
    const pay = await engine.createCategory({ name: "  Salary ", kind: "income" });
    expect(pay.name).toBe("Salary");
    await expect(engine.createCategory({ name: " ", kind: "expense" })).rejects.toThrow();
    await expect(
      engine.createCategory({ name: "Bonus", kind: "expense", parentId: pay.id }),
    ).rejects.toThrow(/kind/i);
    await expect(
      engine.createCategory({ name: "x", kind: "income", parentId: "missing" }),
    ).rejects.toThrow();
  });

  it("renames and moves, and refuses a move under its own descendant", async () => {
    const { engine } = await device();
    const a = await engine.createCategory({ name: "A", kind: "expense" });
    const b = await engine.createCategory({ name: "B", kind: "expense", parentId: a.id });
    const c = await engine.createCategory({ name: "C", kind: "expense", parentId: b.id });

    await engine.editCategory(c.id, { name: "Cee" });
    await engine.moveCategory(c.id, undefined);
    expect((await engine.getCategory(c.id))!.name).toBe("Cee");
    expect((await engine.getCategory(c.id))!.parentId).toBeUndefined();

    await expect(engine.moveCategory(a.id, b.id)).rejects.toThrow(/descendant|itself/i);
    await expect(engine.moveCategory(a.id, a.id)).rejects.toThrow();
    await engine.moveCategory(c.id, b.id);
    expect((await engine.getCategory(c.id))!.parentId).toBe(b.id);
  });

  it("keeps the Balance adjustment Category built in and out of the tree", async () => {
    const { engine } = await device();
    expect(await engine.listCategories()).toEqual([]);
    expect(await engine.getCategory(BALANCE_ADJUSTMENT_CATEGORY)).toMatchObject({
      id: BALANCE_ADJUSTMENT_CATEGORY,
      system: true,
    });
    await expect(engine.deleteCategory(BALANCE_ADJUSTMENT_CATEGORY)).rejects.toThrow();
    await expect(engine.editCategory(BALANCE_ADJUSTMENT_CATEGORY, { name: "x" })).rejects.toThrow();
  });
});

describe("deleting and merging", () => {
  it("deletes a Category with no Lines and moves its children up", async () => {
    const { engine } = await device();
    const a = await engine.createCategory({ name: "A", kind: "expense" });
    const b = await engine.createCategory({ name: "B", kind: "expense", parentId: a.id });
    const c = await engine.createCategory({ name: "C", kind: "expense", parentId: b.id });

    await engine.deleteCategory(b.id);
    expect((await engine.listCategories()).map((x) => x.name)).toEqual(["A", "C"]);
    expect((await engine.getCategory(c.id))!.parentId).toBe(a.id);
    expect(await engine.getCategory(b.id)).toBeUndefined();
  });

  it("will not delete a Category that Lines still use, so nothing is orphaned", async () => {
    const { engine, account } = await withAccount();
    const food = await engine.createCategory({ name: "Food", kind: "expense" });
    await engine.recordTransaction({
      accountId: account.id,
      date: "2026-10-18",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    await expect(engine.deleteCategory(food.id)).rejects.toThrow(/merge/i);
  });

  it("merges into another: Lines and children follow, the source disappears", async () => {
    const { engine, account } = await withAccount();
    const eating = await engine.createCategory({ name: "Eating out", kind: "expense" });
    const food = await engine.createCategory({ name: "Food", kind: "expense" });
    const cafe = await engine.createCategory({
      name: "Cafe",
      kind: "expense",
      parentId: eating.id,
    });
    const tx = await engine.recordTransaction({
      accountId: account.id,
      date: "2026-10-18",
      lines: [{ categoryId: eating.id, amount: -30_000 }],
    });

    await engine.mergeCategory(eating.id, food.id);

    expect((await engine.getTransaction(tx.id))!.lines[0]!.categoryId).toBe(food.id);
    expect((await engine.getCategory(cafe.id))!.parentId).toBe(food.id);
    expect((await engine.listCategories()).map((c) => c.name)).toEqual(["Food", "Cafe"]);
    expect((await engine.getCategory(eating.id))!.id).toBe(food.id);
  });

  it("follows a merge for Lines recorded elsewhere after it", async () => {
    const one = await device(undefined, "dev-a", 1);
    const two = await device(undefined, "dev-b", 2);
    const account = await one.engine.createAccount(wallet);
    const old = await one.engine.createCategory({ name: "Old", kind: "expense" });
    const kept = await one.engine.createCategory({ name: "Kept", kind: "expense" });
    await two.engine.applyOps(await one.engine.exportOps());

    await one.engine.mergeCategory(old.id, kept.id);
    const late = await two.engine.recordTransaction({
      accountId: account.id,
      date: "2026-10-19",
      lines: [{ categoryId: old.id, amount: -500 }],
    });
    await one.engine.applyOps(await two.engine.exportOps());

    expect((await one.engine.getTransaction(late.id))!.lines[0]!.categoryId).toBe(kept.id);
  });

  it("merges only within the same kind and not into itself", async () => {
    const { engine } = await device();
    const spend = await engine.createCategory({ name: "Spend", kind: "expense" });
    const pay = await engine.createCategory({ name: "Pay", kind: "income" });
    await expect(engine.mergeCategory(spend.id, pay.id)).rejects.toThrow(/kind/i);
    await expect(engine.mergeCategory(spend.id, spend.id)).rejects.toThrow();
  });

  it("merging into its own descendant detaches that descendant to the source's place", async () => {
    const { engine } = await device();
    const a = await engine.createCategory({ name: "A", kind: "expense" });
    const b = await engine.createCategory({ name: "B", kind: "expense", parentId: a.id });
    const c = await engine.createCategory({ name: "C", kind: "expense", parentId: b.id });

    await engine.mergeCategory(a.id, c.id);

    const list = await engine.listCategories();
    expect(list.map((x) => x.name).sort()).toEqual(["B", "C"]);
    expect((await engine.getCategory(c.id))!.parentId).toBeUndefined();
    expect((await engine.getCategory(b.id))!.parentId).toBe(c.id);
  });
});

describe("concurrent moves that make a cycle", () => {
  it("detaches the last-edited node to the top level, the same on every device", async () => {
    const one = await device(undefined, "dev-a", 1);
    const two = await device(undefined, "dev-b", 2);
    const a = await one.engine.createCategory({ name: "A", kind: "expense" });
    const b = await one.engine.createCategory({ name: "B", kind: "expense" });
    await two.engine.applyOps(await one.engine.exportOps());

    await one.engine.moveCategory(a.id, b.id);
    two.clock.advance(1_000);
    await two.engine.moveCategory(b.id, a.id);

    await one.engine.applyOps(await two.engine.exportOps());
    await two.engine.applyOps(await one.engine.exportOps());

    const view = async (e: typeof one.engine) =>
      (await e.listCategories()).map((c) => [c.name, c.parentId]);
    expect(await view(one.engine)).toEqual(await view(two.engine));
    // B was edited last: it goes to the top, and A stays under B.
    expect((await one.engine.getCategory(b.id))!.parentId).toBeUndefined();
    expect((await one.engine.getCategory(a.id))!.parentId).toBe(b.id);
  });
});

describe("picker: search and recents", () => {
  it("finds Categories by any part of the name, with their path", async () => {
    const { engine } = await device();
    const food = await engine.createCategory({ name: "Food", kind: "expense" });
    const groceries = await engine.createCategory({
      name: "Groceries",
      kind: "expense",
      parentId: food.id,
    });
    await engine.createCategory({ name: "Salary", kind: "income" });

    const found = await engine.searchCategories("GROC");
    expect(found).toEqual([{ category: groceries, path: ["Food", "Groceries"] }]);
    expect(await engine.searchCategories("zzz")).toEqual([]);
    expect((await engine.searchCategories("")).length).toBe(3);
    expect(
      (await engine.searchCategories("a", { kind: "income" })).map((r) => r.category.name),
    ).toEqual(["Salary"]);
  });

  it("lists recently used Categories, newest first, each once", async () => {
    const { engine, account } = await withAccount();
    const names = ["Food", "Fuel", "Fun", "Fees"];
    const cats = [];
    for (const name of names) cats.push(await engine.createCategory({ name, kind: "expense" }));
    const spend = (categoryId: string, date: string) =>
      engine.recordTransaction({
        accountId: account.id,
        date,
        lines: [{ categoryId, amount: -100 }],
      });
    await spend(cats[0]!.id, "2026-10-01");
    await spend(cats[1]!.id, "2026-10-02");
    await spend(cats[0]!.id, "2026-10-03");
    const gone = await spend(cats[2]!.id, "2026-10-04");
    await engine.deleteTransaction(gone.id);

    expect((await engine.recentCategories(5)).map((c) => c.name)).toEqual(["Food", "Fuel"]);
    expect((await engine.recentCategories(1)).map((c) => c.name)).toEqual(["Food"]);
  });
});

describe("Tags", () => {
  it("creates flat Tags, reusing a name that exists in any case", async () => {
    const { engine } = await device();
    const trip = await engine.createTag("Bali trip");
    expect((await engine.createTag(" bali TRIP ")).id).toBe(trip.id);
    await engine.createTag("Work");
    expect((await engine.listTags()).map((t) => t.name)).toEqual(["Bali trip", "Work"]);
    await expect(engine.createTag("  ")).rejects.toThrow();
  });

  it("renames and deletes, and a deleted Tag leaves its Transactions", async () => {
    const { engine, account } = await withAccount();
    const food = await engine.createCategory({ name: "Food", kind: "expense" });
    const trip = await engine.createTag("Trip");
    const tx = await engine.recordTransaction({
      accountId: account.id,
      date: "2026-10-18",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    await engine.tagTransaction(tx.id, trip.id);
    await engine.renameTag(trip.id, "Bali");
    expect((await engine.getTransaction(tx.id))!.tagIds).toEqual([trip.id]);
    expect((await engine.listTags())[0]!.name).toBe("Bali");

    await engine.deleteTag(trip.id);
    expect(await engine.listTags()).toEqual([]);
    expect((await engine.getTransaction(tx.id))!.tagIds).toBeUndefined();
  });

  it("attaches many Tags to a Transaction and detaches them", async () => {
    const { engine, account } = await withAccount();
    const food = await engine.createCategory({ name: "Food", kind: "expense" });
    const a = await engine.createTag("A");
    const b = await engine.createTag("B");
    const tx = await engine.recordTransaction({
      accountId: account.id,
      date: "2026-10-18",
      lines: [{ categoryId: food.id, amount: -1_000 }],
    });
    expect(tx.tagIds).toBeUndefined();

    await engine.tagTransaction(tx.id, a.id);
    await engine.tagTransaction(tx.id, b.id);
    await engine.tagTransaction(tx.id, a.id);
    expect((await engine.getTransaction(tx.id))!.tagIds).toEqual([a.id, b.id].sort());

    await engine.untagTransaction(tx.id, a.id);
    expect((await engine.getTransaction(tx.id))!.tagIds).toEqual([b.id]);
    await expect(engine.tagTransaction(tx.id, "nope")).rejects.toThrow();
  });
});

describe("categories and tags on another device", () => {
  it("round-trip through the op log and a restart", async () => {
    const first = await device();
    const food = await first.engine.createCategory({ name: "Food", kind: "expense" });
    const trip = await first.engine.createTag("Trip");

    const restarted = await device(first.store, "dev-a", 2);
    expect((await restarted.engine.listCategories()).map((c) => c.id)).toEqual([food.id]);
    expect((await restarted.engine.listTags()).map((t) => t.id)).toEqual([trip.id]);
  });
});
