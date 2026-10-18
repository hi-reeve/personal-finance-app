import type { Op } from "./ops";

/** Wall clock in epoch milliseconds (UTC). */
export interface Clock {
  now(): number;
}

/** Source of random bytes. Injected so ids are deterministic in tests. */
export interface Random {
  bytes(length: number): Uint8Array;
}

/** Append-only store for the local op log. */
export interface OpStore {
  append(ops: readonly Op[]): Promise<void>;
  readAll(): Promise<Op[]>;
}

export function createMemoryStore(): OpStore {
  const log: Op[] = [];
  return {
    async append(ops) {
      log.push(...ops);
    },
    async readAll() {
      return [...log];
    },
  };
}
