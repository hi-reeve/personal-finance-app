import {
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  SIGNATURE_WINDOW_MS,
  base64UrlDecode,
  signingString,
} from "@pfa/protocol";

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

const TIMESTAMP = /^\d{1,15}$/;
/** An Ed25519 signature is 64 bytes, which is 86 characters of base64url. */
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

/**
 * A cheap look at the headers only: is this request even shaped like a signed one, and recent?
 * It proves nothing about who signed it, but it lets the relay turn away junk before touching storage.
 */
export function looksSigned(request: Request, now = Date.now()): boolean {
  const timestamp = request.headers.get(HEADER_TIMESTAMP) ?? "";
  return (
    TIMESTAMP.test(timestamp) &&
    Math.abs(now - Number(timestamp)) <= SIGNATURE_WINDOW_MS &&
    SIGNATURE.test(request.headers.get(HEADER_SIGNATURE) ?? "")
  );
}

/**
 * Checks that a request was signed by the holder of `publicKey` (Ed25519, base64url) very recently.
 * Uses the runtime's built-in WebCrypto: libsodium is not needed here because the relay never decrypts.
 */
export async function isSignedBy(
  request: Request,
  body: string,
  publicKey: string,
  now = Date.now(),
): Promise<boolean> {
  if (!looksSigned(request, now)) return false;
  const timestamp = Number(request.headers.get(HEADER_TIMESTAMP));
  const signature = request.headers.get(HEADER_SIGNATURE)!;
  try {
    const url = new URL(request.url);
    const bodySha256 = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
    const message = new TextEncoder().encode(
      signingString({
        method: request.method,
        path: url.pathname + url.search,
        timestamp,
        bodySha256,
      }),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      base64UrlDecode(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      base64UrlDecode(signature),
      message,
    );
  } catch {
    return false;
  }
}
