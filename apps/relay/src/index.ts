import { base64UrlDecode, type CreateSpaceRequest } from "@pfa/protocol";
import type { Env } from "./env";
import { verifyTurnstile } from "./turnstile";

export { SpaceObject } from "./space";

const SPACE_ID = /^[A-Za-z0-9_-]{8,64}$/;

async function createSpace(request: Request, env: Env): Promise<Response> {
  let body: CreateSpaceRequest;
  try {
    body = (await request.json()) as CreateSpaceRequest;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const validKey = (() => {
    try {
      return base64UrlDecode(String(body.ownerPublicKey)).length === 32;
    } catch {
      return false;
    }
  })();
  if (!SPACE_ID.test(String(body.spaceId)) || !validKey)
    return new Response("Bad request", { status: 400 });

  if (
    !(await verifyTurnstile(
      String(body.turnstileToken ?? ""),
      env,
      request.headers.get("cf-connecting-ip"),
    ))
  ) {
    return new Response("Turnstile check failed", { status: 403 });
  }

  const space = env.SPACE.get(env.SPACE.idFromName(body.spaceId));
  return (await space.create(body.ownerPublicKey))
    ? new Response(null, { status: 201 })
    : new Response("Space already exists", { status: 409 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/v1/spaces" && request.method === "POST")
      return createSpace(request, env);

    const match = /^\/v1\/spaces\/([A-Za-z0-9_-]{1,64})\/(ops|live)$/.exec(url.pathname);
    if (match) return env.SPACE.get(env.SPACE.idFromName(match[1]!)).fetch(request);

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
