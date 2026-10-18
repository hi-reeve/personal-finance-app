/** Wire format shared by every client and the relay. The relay sees only what is in these types. */

/**
 * Wire protocol version. It changes only on a breaking wire change, never with an app release, so an
 * old app keeps syncing until the relay's minimum version passes it.
 */
export const PROTOCOL_VERSION = 1;

/** Space ids are derived from the secret, so they are long and unguessable; this is just the allowed shape. */
export const SPACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export const MAX_DEVICE_ID_LENGTH = 64;
export const MAX_PROTOCOL_VERSION = 65_535;
/** Most ops one append may carry. */
export const MAX_OPS_PER_APPEND = 100;
/** Largest request bodies the relay will read, so a hostile client cannot make it buffer without limit. */
export const MAX_APPEND_BODY_BYTES = 1024 * 1024;
export const MAX_CREATE_BODY_BYTES = 4 * 1024;
/** One fetch returns at most this much ciphertext; the client asks again from the last position it got. */
export const MAX_FETCH_BYTES = 1024 * 1024;

/** Requests older or newer than this are refused, which limits replay of a captured request. */
export const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

/** Largest ciphertext the relay accepts for one op. */
export const MAX_OP_BYTES = 64 * 1024;

export const HEADER_TIMESTAMP = "x-pfa-timestamp";
export const HEADER_SIGNATURE = "x-pfa-signature";

export interface CreateSpaceRequest {
  spaceId: string;
  /** Ed25519 public key (32 bytes, base64url) that signs this space's requests. */
  ownerPublicKey: string;
  turnstileToken: string;
}

export interface WireOp {
  deviceId: string;
  protocolVersion: number;
  /** Encrypted op, base64url. The relay never decrypts it. */
  ciphertext: string;
}

export interface AppendRequest {
  ops: WireOp[];
}

export interface AppendResponse {
  firstSeq: number;
  lastSeq: number;
}

export interface StoredOp extends WireOp {
  /** Position in the space's log, assigned by the relay. */
  seq: number;
}

export interface FetchResponse {
  ops: StoredOp[];
  latest: number;
}

/** The exact text that is signed, so client and relay cannot disagree about what a signature covers. */
export function signingString(parts: {
  method: string;
  path: string;
  timestamp: number;
  bodySha256: string;
}): string {
  return [parts.method.toUpperCase(), parts.path, String(parts.timestamp), parts.bodySha256].join(
    "\n",
  );
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(chunk >> 18) & 63]! + ALPHABET[(chunk >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(chunk >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[chunk & 63]!;
  }
  return out;
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1)
    throw new Error("Not valid base64url");
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = ALPHABET.indexOf(text[i]!);
    const b = ALPHABET.indexOf(text[i + 1]!);
    const c = i + 2 < text.length ? ALPHABET.indexOf(text[i + 2]!) : 0;
    const d = i + 3 < text.length ? ALPHABET.indexOf(text[i + 3]!) : 0;
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (chunk >> 16) & 255;
    if (i + 2 < text.length) out[o++] = (chunk >> 8) & 255;
    if (i + 3 < text.length) out[o++] = chunk & 255;
  }
  return out;
}
