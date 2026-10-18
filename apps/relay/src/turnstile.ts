import type { Env } from "./env";

const DEFAULT_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Asks Cloudflare whether a Turnstile token is genuine. Anything other than a clear yes is a no. */
export async function verifyTurnstile(
  token: string,
  env: Env,
  remoteIp: string | null,
): Promise<boolean> {
  if (token === "") return false;
  try {
    const response = await fetch(env.TURNSTILE_VERIFY_URL ?? DEFAULT_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
