import type { Clock, Random } from "./adapters";

/** Test support: not part of the public `@pfa/core` API. */

export interface ManualClock extends Clock {
  advance(ms: number): void;
}

export function createManualClock(startMs: number): ManualClock {
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
  };
}

/** Deterministic pseudo-random bytes (xorshift32). Not for real use. */
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
