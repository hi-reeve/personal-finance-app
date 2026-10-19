import { dismissFullBannerUntil, localOnlyBanner } from "@pfa/core";
import { useState } from "react";
import { useLocale } from "../components/locale";
import { useApp } from "./app-provider";

const KEY = "pfa.banner-dismissed-until";

function readDismissed(): number | undefined {
  try {
    const value = Number(localStorage.getItem(KEY));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Says the data is only on this device. Escalates with use (see `localOnlyBanner`) and never blocks:
 * the full-screen prompt can always be put off for a day.
 */
export function LocalOnlyBanner() {
  const { t } = useLocale();
  const app = useApp();
  const [dismissedUntil, setDismissedUntil] = useState(readDismissed);

  if (app.status !== "ready" || app.settings.setupAt === undefined) return null;
  const level = localOnlyBanner({
    syncOn: false,
    setupAt: app.settings.setupAt,
    now: Date.now(),
    transactions: app.transactions,
    ...(dismissedUntil !== undefined ? { dismissedUntil } : {}),
  });
  if (level === "none") return null;

  if (level === "full") {
    const dismiss = () => {
      const until = dismissFullBannerUntil(Date.now());
      try {
        localStorage.setItem(KEY, String(until));
      } catch {
        // Storage can be blocked; the prompt then returns on the next visit.
      }
      setDismissedUntil(until);
    };
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="local-only-title"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas p-6 text-center"
      >
        <h2 id="local-only-title" className="text-2xl font-semibold">
          {t.banner_full_title()}
        </h2>
        <p className="max-w-md text-ink-muted">{t.banner_full_body()}</p>
        <button
          type="button"
          onClick={dismiss}
          className="min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t.banner_dismiss()}
        </button>
      </div>
    );
  }

  return (
    <p
      role="status"
      data-level={level}
      className={`px-4 py-2 text-sm ${
        level === "strong"
          ? "bg-warning text-canvas font-medium"
          : "border-b border-line bg-surface text-ink"
      }`}
    >
      {level === "strong" ? t.banner_strong() : t.banner_gentle()}
    </p>
  );
}
