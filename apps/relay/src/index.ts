import {
  MAX_CREATE_BODY_BYTES,
  SPACE_ID_PATTERN,
  base64UrlDecode,
  type CreateSpaceRequest,
} from "@pfa/protocol";
import { looksSigned } from "./auth";
import type { Env } from "./env";
import { readJsonObject } from "./http";
import { verifyTurnstile } from "./turnstile";

export { SpaceObject } from "./space";

const isPublicKey = (value: unknown): boolean => {
  try {
    return typeof value === "string" && base64UrlDecode(value).length === 32;
  } catch {
    return false;
  }
};

async function createSpace(request: Request, env: Env): Promise<Response> {
  const parsed = await readJsonObject(request, MAX_CREATE_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed as Partial<CreateSpaceRequest>;
  if (
    typeof body.spaceId !== "string" ||
    !SPACE_ID_PATTERN.test(body.spaceId) ||
    !isPublicKey(body.ownerPublicKey)
  ) {
    return new Response("Bad request", { status: 400 });
  }

  const check = await verifyTurnstile(
    typeof body.turnstileToken === "string" ? body.turnstileToken : "",
    env,
    request.headers.get("cf-connecting-ip"),
  );
  if (check === "unavailable")
    return new Response("Turnstile unavailable, try again", { status: 503 });
  if (check === "invalid") return new Response("Turnstile check failed", { status: 403 });

  const space = env.SPACE.get(env.SPACE.idFromName(body.spaceId));
  return (await space.create(body.ownerPublicKey as string))
    ? new Response(null, { status: 201 })
    : new Response("Space already exists", { status: 409 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/v1/spaces" && request.method === "POST")
      return createSpace(request, env);

    const match = /^\/v1\/spaces\/([A-Za-z0-9_-]{8,64})\/(ops|live)$/.exec(url.pathname);
    if (match) {
      // Requests that are not even shaped like signed ones never reach (or wake) a Space.
      if (!looksSigned(request)) return new Response("Bad signature", { status: 401 });
      return env.SPACE.get(env.SPACE.idFromName(match[1]!)).fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
