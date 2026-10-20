import { dismissFullBannerUntil, localOnlyBanner } from "@pfa/core";
import { useEffect, useRef, useState } from "react";
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

const RECHECK_MS = 60_000;

/** The current time, refreshed each minute so a tab left open still escalates. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), RECHECK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Says the data is only on this device. Escalates with use (see `localOnlyBanner`) and never blocks:
 * the full-screen prompt can always be put off for a day.
 */
export function LocalOnlyBanner() {
  const { t } = useLocale();
  const app = useApp();
  const [dismissedUntil, setDismissedUntil] = useState(readDismissed);
  const now = useNow();

  if (app.status !== "ready" || app.settings.setupAt === undefined) return null;
  const level = localOnlyBanner({
    syncOn: false,
    setupAt: app.settings.setupAt,
    now,
    transactions: app.activity.length,
    ...(dismissedUntil !== undefined ? { dismissedUntil } : {}),
  });
  if (level === "none") return null;

  if (level === "full") {
    return <FullScreenPrompt onDismiss={() => setDismissedUntil(putOffForADay())} />;
  }

  return (
    <p
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

function putOffForADay(): number {
  const until = dismissFullBannerUntil(Date.now());
  try {
    localStorage.setItem(KEY, String(until));
  } catch {
    // Storage can be blocked; the prompt then returns on the next visit.
  }
  return until;
}

/** A native modal dialog: the page behind it is inert, focus moves in, and Escape puts it off. */
function FullScreenPrompt({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="local-only-title"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-canvas p-6 text-ink backdrop:bg-ink/40"
    >
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h2 id="local-only-title" className="text-2xl font-semibold">
          {t.banner_full_title()}
        </h2>
        <p className="max-w-md text-ink-muted">{t.banner_full_body()}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t.banner_dismiss()}
        </button>
      </div>
    </dialog>
  );
}
