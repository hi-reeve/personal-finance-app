/** Hybrid logical clock stamp: wall time, a counter for ties, and the device as final tiebreak. */
export interface Hlc {
  wall: number;
  counter: number;
  device: string;
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.wall !== b.wall) return a.wall - b.wall;
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.device < b.device ? -1 : a.device > b.device ? 1 : 0;
}
