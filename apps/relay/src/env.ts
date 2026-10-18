import type { SpaceObject } from "./space";

export interface Env {
  SPACE: DurableObjectNamespace<SpaceObject>;
  /** Turnstile secret key. Set with `wrangler secret put`; never committed. */
  TURNSTILE_SECRET: string;
  /**
   * "1" switches on behaviour that exists only for tests: redirecting the Turnstile check and
   * reporting database row counts. Production never sets it, so those settings are ignored there.
   */
  TEST_MODE?: string;
  /** Test only (needs TEST_MODE): where to send the Turnstile check. */
  TURNSTILE_VERIFY_URL?: string;
}

export const isTestMode = (env: Env): boolean => env.TEST_MODE === "1";
