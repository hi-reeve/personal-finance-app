import { describe, expect, it } from "vite-plus/test";
import type { OpStore } from "./adapters";
import type { Op } from "./ops";

const op = (n: number, overrides: Partial<Op> = {}): Op => ({
  id: `op-${n}`,
  hlc: { wall: 1_700_000_000_000 + n, counter: n % 3, device: "device-a" },
  entity: "transaction",
  recordId: "tx-1",
  field: "note",
  value: `value ${n}`,
  ...overrides,
});

/**
 * What every `OpStore` must do, whatever it stores into. Run it from the adapter's own tests with a
 * factory that returns an empty store each time.
 */
export function opStoreContract(name: string, create: () => OpStore | Promise<OpStore>) {
  describe(`${name} satisfies the OpStore contract`, () => {
    it("is empty to begin with", async () => {
      const store = await create();
      expect(await store.readAll()).toEqual([]);
    });

    it("returns appended ops in the order they were appended, across calls", async () => {
      const store = await create();
      await store.append([op(1), op(2)]);
      await store.append([op(3)]);
      await store.append([]);
      await store.append([op(4)]);
      expect((await store.readAll()).map((o) => o.id)).toEqual(["op-1", "op-2", "op-3", "op-4"]);
    });

    it("keeps every field of an op exactly", async () => {
      const store = await create();
      const ops = [
        op(1, { value: 12_500 }),
        op(2, { value: 0 }),
        op(3, { value: -7.5 }),
        op(4, { value: "" }),
        op(5, { value: 'Warung “Bu Sari” — nasi goreng 🍳\n"quoted" \\ back' }),
        op(6, {
          entity: "line",
          recordId: "line-9",
          field: "amount",
          value: Number.MAX_SAFE_INTEGER,
        }),
      ];
      await store.append(ops);
      expect(await store.readAll()).toEqual(ops);
    });

    it("hands out a copy, so changing the result does not change the store", async () => {
      const store = await create();
      await store.append([op(1)]);
      const first = await store.readAll();
      first.length = 0;
      expect(await store.readAll()).toHaveLength(1);
    });

    it("keeps the order of a large batch", async () => {
      const store = await create();
      const ops = Array.from({ length: 1000 }, (_, i) => op(i));
      await store.append(ops);
      expect((await store.readAll()).map((o) => o.id)).toEqual(ops.map((o) => o.id));
    });
  });
}
