const KEY = "pfa.persistence";

export type PersistenceOutcome =
  | { status: "granted" | "denied" | "unsupported"; checkedAt: number }
  | { status: "error"; checkedAt: number; message: string };

/**
 * Ask the browser not to evict our data under storage pressure, and remember what it answered so
 * Settings can show it. Browsers may grant silently, ask the user, or refuse; Safari tabs can be
 * cleared after a week without use unless the app is on the Home Screen.
 */
export async function requestPersistence(
  now: () => number = Date.now,
): Promise<PersistenceOutcome> {
  let outcome: PersistenceOutcome;
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
      outcome = { status: "unsupported", checkedAt: now() };
    } else {
      const already = await navigator.storage.persisted();
      const granted = already || (await navigator.storage.persist());
      outcome = { status: granted ? "granted" : "denied", checkedAt: now() };
    }
  } catch (error) {
    outcome = {
      status: "error",
      checkedAt: now(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(outcome));
  } catch {
    // Storage can be blocked; the outcome then lasts only for this session.
  }
  return outcome;
}

export function readPersistenceOutcome(): PersistenceOutcome | undefined {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return undefined;
    const { status, checkedAt, message } = raw as Record<string, unknown>;
    if (typeof checkedAt !== "number") return undefined;
    if (status === "error" && typeof message === "string") return { status, checkedAt, message };
    if (status === "granted" || status === "denied" || status === "unsupported") {
      return { status, checkedAt };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
