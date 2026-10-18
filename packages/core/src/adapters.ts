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
export interface Storage {
  append(ops: readonly Op[]): Promise<void>;
  readAll(): Promise<Op[]>;
}

export function createMemoryStorage(): Storage {
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

export interface ManualClock extends Clock {
  set(ms: number): void;
  advance(ms: number): void;
}

export function createManualClock(startMs: number): ManualClock {
  let current = startMs;
  return {
    now: () => current,
    set(ms) {
      current = ms;
    },
    advance(ms) {
      current += ms;
    },
  };
}

/** Deterministic pseudo-random bytes (xorshift32) for tests. Not for real use. */
export function createSeededRandom(seed: number): Random {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  return {
    bytes(length) {
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = next() & 0xff;
      return out;
    },
  };
}
