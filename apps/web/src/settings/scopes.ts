import type { Preferences } from "@pfa/core";

/**
 * Where each setting lives. `synced` settings are written to the shared log and follow the user to
 * every device; `device` settings stay in this browser's storage and are never synced.
 */
export type Scope = "synced" | "device";

/** Exactly the keys of the synced `Preferences`: adding one there makes this fail to compile. */
const SYNCED = {
  numberFormat: "synced",
  dateFormat: "synced",
  budgetNearLimit: "synced",
  budgetStartDay: "synced",
} as const satisfies Record<keyof Preferences, "synced">;

const DEVICE = {
  language: "device",
  theme: "device",
  accent: "device",
  colors: "device",
  hideAmountsStart: "device",
} as const;

export const SETTING_SCOPES = { ...SYNCED, ...DEVICE } as const;

/** The browser-storage key each device-local setting is kept under. */
export const DEVICE_STORAGE_KEYS: Record<keyof typeof DEVICE, string> = {
  language: "PARAGLIDE_LOCALE",
  theme: "pfa.appearance",
  accent: "pfa.appearance",
  colors: "pfa.appearance",
  hideAmountsStart: "pfa.hideAmountsStart",
};
