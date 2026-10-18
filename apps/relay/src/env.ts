import type { SpaceObject } from "./space";

export interface Env {
  SPACE: DurableObjectNamespace<SpaceObject>;
  /** Turnstile secret key. Set with `wrangler secret put`; never committed. */
  TURNSTILE_SECRET: string;
  /** Override for tests. Defaults to Cloudflare's verification endpoint. */
  TURNSTILE_VERIFY_URL?: string;
  /** "1" adds row-count headers to append responses, to measure storage cost. Off in production. */
  DEBUG_COSTS?: string;
}
