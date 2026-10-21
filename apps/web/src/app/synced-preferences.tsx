import { useEffect, useRef } from "react";
import { useLocale } from "../components/locale";
import { useApp } from "./app-provider";

/**
 * Brings the synced number and date formats into effect on this device. The value in the shared
 * settings wins over this browser's own default; with none chosen yet the device keeps its locale.
 */
export function SyncedPreferences() {
  const app = useApp();
  const locale = useLocale();
  const latest = useRef(locale);
  latest.current = locale;
  const numberFormat = app.status === "ready" ? app.settings.numberFormat : undefined;
  const dateFormat = app.status === "ready" ? app.settings.dateFormat : undefined;

  useEffect(() => {
    if (numberFormat !== undefined && numberFormat !== latest.current.numberFormat)
      latest.current.setNumberFormat(numberFormat);
  }, [numberFormat]);
  useEffect(() => {
    if (dateFormat !== undefined && dateFormat !== latest.current.dateFormat)
      latest.current.setDateFormat(dateFormat);
  }, [dateFormat]);
  return null;
}
