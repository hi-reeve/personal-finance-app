import { isTestMode, type Env } from "./env";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

export type TurnstileResult = "valid" | "invalid" | "unavailable";

/**
 * Asks Cloudflare whether a Turnstile token is genuine. A clear "no" is `invalid`; a failure to get any
 * clear answer is `unavailable`, so clients can retry instead of being told their token is bad.
 * Neither lets a Space be created.
 */
export async function verifyTurnstile(
  token: string,
  env: Env,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  if (token === "") return "invalid";
  const url = isTestMode(env) && env.TURNSTILE_VERIFY_URL ? env.TURNSTILE_VERIFY_URL : VERIFY_URL;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "unavailable";
    const result = (await response.json()) as { success?: unknown };
    return result.success === true ? "valid" : "invalid";
  } catch {
    return "unavailable";
  }
}
