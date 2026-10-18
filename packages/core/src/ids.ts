import type { Clock, Random } from "./adapters";

const HEX = "0123456789abcdef";

/** UUIDv7: 48-bit millisecond timestamp, version 7, variant 10, random remainder. */
export function newUuidV7(clock: Clock, random: Random): string {
  const bytes = random.bytes(16);
  let ms = clock.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += "-";
    out += HEX[bytes[i]! >> 4]! + HEX[bytes[i]! & 0x0f]!;
  }
  return out;
}
