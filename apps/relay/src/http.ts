/**
 * Reads a request body as a JSON object, refusing anything larger than `maxBytes` or not an object.
 * Returns the object, or the error response to send back.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown> | Response> {
  const text = await readText(request, maxBytes);
  if (text instanceof Response) return text;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value as Record<string, unknown>;
  } catch {
    // fall through to the same answer as any other malformed body
  }
  return new Response("Bad request", { status: 400 });
}

/** Reads a body as text, refusing anything larger than `maxBytes` (checked before and after reading). */
export async function readText(request: Request, maxBytes: number): Promise<string | Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return new Response("Request too large", { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes)
    return new Response("Request too large", { status: 413 });
  return text;
}
