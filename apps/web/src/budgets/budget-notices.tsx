import { thresholdCrossings, type ThresholdCrossed } from "@pfa/core";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Change, ReadyState } from "../app/app-provider";
import { useLocale } from "../components/locale";
import { BUTTON } from "../components/styles";

type Notify = (crossed: readonly ThresholdCrossed[]) => void;

const NoticeContext = createContext<Notify>(() => {});

/** Said once, after a save: which budgets that Transaction pushed to near or over their limit. */
export const useBudgetNotices = () => useContext(NoticeContext);

/**
 * Saves with `change`, then says which budgets it pushed past a threshold. The Transaction is
 * always saved: a budget only ever warns.
 */
export function useSaveWithWarning(
  app: ReadyState,
): (date: string, change: Change) => Promise<void> {
  const notify = useBudgetNotices();
  return useCallback(
    async (date, change) => {
      let crossed: ThresholdCrossed[] = [];
      await app.act(async (engine) => {
        const before = await engine.budgetProgress(date);
        await change(engine);
        crossed = thresholdCrossings(before, await engine.budgetProgress(date));
      });
      notify(crossed);
    },
    [app, notify],
  );
}

export function BudgetNotices({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [shown, setShown] = useState<readonly ThresholdCrossed[]>([]);
  const notify = useCallback<Notify>((crossed) => setShown(crossed), []);
  return (
    <NoticeContext.Provider value={notify}>
      {children}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4 md:bottom-6"
      >
        {shown.length > 0 && (
          <div className="pointer-events-auto flex max-w-md flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-lg">
            <ul className="flex flex-col gap-1">
              {shown.map((c) => {
                const name = c.categoryId === undefined ? t.budgets_overall() : c.name;
                return (
                  <li key={`${c.categoryId ?? "overall"}-${c.state}`}>
                    <span aria-hidden="true">{c.state === "over" ? "✕ " : "! "}</span>
                    {c.state === "over"
                      ? t.budget_crossed_over({ name })
                      : t.budget_crossed_near({ name })}
                  </li>
                );
              })}
            </ul>
            <button type="button" className={BUTTON} onClick={() => setShown([])}>
              {t.budget_notice_dismiss()}
            </button>
          </div>
        )}
      </div>
    </NoticeContext.Provider>
  );
}
