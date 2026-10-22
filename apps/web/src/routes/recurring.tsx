import { isPausedOn, priceOn } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { today } from "../app/today";
import { useApp, type ReadyState } from "../app/app-provider";
import { Amount } from "../components/amount";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";
import { BUTTON } from "../components/styles";
import { OccurrenceRow } from "../recurring/occurrence-row";
import { RecurringForm } from "../recurring/recurring-form";
import { useOccurrences } from "../recurring/use-occurrences";
import { useSubscriptions } from "../recurring/use-subscriptions";

export const Route = createFileRoute("/recurring")({ component: Screen });

function Screen() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <Recurring app={app} /> : <Page title={t.nav_recurring()} />;
}

function Recurring({ app }: { app: ReadyState }) {
  const { t, money } = useLocale();
  const now = today();
  const state = useOccurrences(app, now);
  const subscriptions = useSubscriptions(app, now);
  const [editing, setEditing] = useState<string | "new" | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const close = () => setEditing(undefined);

  async function remove(id: string) {
    await attempt((engine) => engine.deleteRecurring(id));
  }

  async function attempt(change: Parameters<typeof app.act>[0]) {
    setProblem(undefined);
    try {
      await app.act(change);
    } catch (error) {
      setProblem(
        t.recurring_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  const open = state.status === "ready" ? state.open : [];
  // Overdue ones stay listed until someone acts, oldest first.
  const overdueBefore = (itemId: string, due: string) =>
    open.filter((o) => o.itemId === itemId && o.status === "overdue" && o.due < due).length;

  return (
    <Page title={t.nav_recurring()}>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-danger">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <>
          <section aria-labelledby="to-act" className="flex flex-col gap-3">
            <h2 id="to-act" className="text-lg font-medium">
              {t.recurring_to_act()}
            </h2>
            {state.open.length === 0 ? (
              <p className="text-ink-muted">{t.recurring_none_due()}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {state.open.map((o) => (
                  <OccurrenceRow
                    key={o.id}
                    app={app}
                    occurrence={o}
                    olderCount={overdueBefore(o.itemId, o.due)}
                  />
                ))}
              </ul>
            )}
          </section>
          {state.recent.length > 0 && (
            <section aria-labelledby="recent" className="flex flex-col gap-3">
              <h2 id="recent" className="text-lg font-medium">
                {t.recurring_history()}
              </h2>
              <ul className="flex flex-col gap-3">
                {state.recent.map((o) => (
                  <OccurrenceRow key={o.id} app={app} occurrence={o} olderCount={0} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <section aria-labelledby="subscriptions" className="flex flex-col gap-3">
        <h2 id="subscriptions" className="text-lg font-medium">
          {t.recurring_subscriptions()}
        </h2>
        {subscriptions !== undefined && subscriptions.subscriptions.length === 0 && (
          <p className="text-ink-muted">{t.recurring_subscriptions_none()}</p>
        )}
        {subscriptions !== undefined && subscriptions.subscriptions.length > 0 && (
          <>
            <p className="flex flex-wrap gap-x-4 font-medium">
              {subscriptions.monthly.map((total) => (
                <span key={total.currency}>
                  {t.recurring_monthly_total({ amount: money(total.amount, total.currency) })}
                </span>
              ))}
            </p>
            <ul className="flex flex-col gap-2">
              {subscriptions.subscriptions.map((entry) => (
                <li
                  key={entry.itemId}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-line bg-surface p-3"
                >
                  <span className="min-w-0 truncate">
                    {entry.name}
                    {entry.status !== "active" && (
                      <span className="ms-2 text-sm text-ink-muted">
                        {entry.status === "paused"
                          ? t.recurring_status_paused()
                          : t.recurring_status_ended()}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-ink-muted">
                    {t.recurring_monthly_each({ amount: money(entry.monthly, entry.currency) })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section aria-labelledby="items" className="flex flex-col gap-3">
        <h2 id="items" className="text-lg font-medium">
          {t.recurring_items()}
        </h2>
        {app.recurring.length === 0 && editing !== "new" && (
          <p className="text-ink-muted">{t.recurring_empty()}</p>
        )}
        <ul className="flex flex-col gap-3">
          {app.recurring.map((item) => {
            const paused = isPausedOn(item, now);
            return editing === item.id ? (
              <li key={item.id}>
                <RecurringForm app={app} item={item} onDone={close} onCancel={close} />
              </li>
            ) : (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="min-w-0 truncate font-medium">{item.name}</h3>
                  <Amount
                    direction={
                      item.kind === "income"
                        ? "income"
                        : item.kind === "expense"
                          ? "expense"
                          : "neutral"
                    }
                    variant="list"
                    formatted={money(
                      priceOn(item, now),
                      app.accounts.find((a) => a.id === item.accountId)?.currency ?? "USD",
                    )}
                  />
                </div>
                <p className="text-sm text-ink-muted">
                  {t.recurring_every_text({
                    every: item.every,
                    unit: t[`recurring_unit_${item.unit}`](),
                  })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label={
                      paused
                        ? t.recurring_resume({ name: item.name })
                        : t.recurring_pause({ name: item.name })
                    }
                    onClick={() =>
                      void attempt((engine) =>
                        paused
                          ? engine.resumeRecurring(item.id, now)
                          : engine.pauseRecurring(item.id, now),
                      )
                    }
                  >
                    {isPausedOn(item, now)
                      ? t.recurring_status_resume()
                      : t.recurring_status_pause()}
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label={t.recurring_edit({ name: item.name })}
                    onClick={() => setEditing(item.id)}
                  >
                    {t.budgets_change()}
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label={t.recurring_delete({ name: item.name })}
                    onClick={() => void remove(item.id)}
                  >
                    {t.budgets_remove_button()}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {editing === "new" ? (
          <RecurringForm app={app} onDone={close} onCancel={close} />
        ) : (
          <button type="button" className={BUTTON} onClick={() => setEditing("new")}>
            {t.recurring_add()}
          </button>
        )}
      </section>
    </Page>
  );
}
