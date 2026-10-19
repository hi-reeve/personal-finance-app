import { createEngine, type Engine } from "@pfa/core";
import { useEffect, useMemo, useState } from "react";
import {
  readPersistenceOutcome,
  requestPersistence,
  type PersistenceOutcome,
} from "../storage/persistence";
import { openWebStore } from "../storage/web-store";
import { useLocale } from "./locale";

/** A scratch database, so the check never touches the user's real data. */
const CHECK_FILE = "pfa-storage-check.sqlite3";

function checkEngine(): Promise<Engine> {
  return createEngine({
    deviceId: "storage-check",
    clock: { now: () => Date.now() },
    random: { bytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    store: openWebStore(CHECK_FILE),
  });
}

const OUTCOME_TEXT = {
  granted: "storage_granted",
  denied: "storage_denied",
  unsupported: "storage_unsupported",
} as const;

/** Shows whether the browser promised to keep our data, and lets you prove a record survives a reload. */
export function StorageSection() {
  const { t } = useLocale();
  const engine = useMemo(checkEngine, []);
  const [outcome, setOutcome] = useState<PersistenceOutcome | undefined>(readPersistenceOutcome);
  const [count, setCount] = useState<number | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  useEffect(() => {
    void requestPersistence().then(setOutcome);
  }, []);

  const refresh = () =>
    engine
      .then((e) => e.listTransactions())
      .then(
        (all) => setCount(all.length),
        (error: unknown) => setFailure(error instanceof Error ? error.message : String(error)),
      );
  useEffect(() => {
    void refresh();
  }, [engine]);

  const runCheck = async () => {
    setFailure(undefined);
    try {
      await (
        await engine
      ).recordTransaction({
        accountId: "storage-check",
        date: "2026-01-01",
        lines: [{ categoryId: "storage-check", amount: 1 }],
      });
      await refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  const persistence =
    outcome === undefined
      ? t.storage_unknown()
      : outcome.status === "error"
        ? t.storage_error({ message: outcome.message })
        : t[OUTCOME_TEXT[outcome.status]]();

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="storage">
      <h2 id="storage" className="mb-3 font-medium">
        {t.section_storage()}
      </h2>
      <p className="text-sm">
        <span className="font-medium">{t.storage_persistence()}: </span>
        <span data-testid="persistence" data-status={outcome?.status ?? "pending"}>
          {persistence}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runCheck}
          className="min-h-11 rounded-lg border border-control px-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t.storage_check_button()}
        </button>
        {count !== undefined && (
          <p role="status" className="text-sm text-ink-muted">
            {t.storage_check_count({ count })}
          </p>
        )}
      </div>
      {failure !== undefined && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t.storage_check_failed({ message: failure })}
        </p>
      )}
    </section>
  );
}
