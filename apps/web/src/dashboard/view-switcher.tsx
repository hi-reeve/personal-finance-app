import { useCallback, useState } from "react";
import { Choice } from "../components/appearance";
import { useLocale } from "../components/locale";

export const HOME_VIEWS = ["summary", "categories"] as const;
export type HomeView = (typeof HOME_VIEWS)[number];

const KEY = "pfa.homeView";

function readView(): HomeView {
  try {
    const stored = localStorage.getItem(KEY);
    return HOME_VIEWS.includes(stored as HomeView) ? (stored as HomeView) : "summary";
  } catch {
    return "summary";
  }
}

/** Which Home view is showing. A device-local choice, remembered on this device. */
export function useHomeView(): [HomeView, (view: HomeView) => void] {
  const [view, setView] = useState<HomeView>(readView);
  const choose = useCallback((next: HomeView) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // The choice then lasts only for this visit.
    }
    setView(next);
  }, []);
  return [view, choose];
}

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: HomeView;
  onChange: (view: HomeView) => void;
}) {
  const { t } = useLocale();
  const labels: Record<HomeView, string> = {
    summary: t.view_summary(),
    categories: t.view_categories(),
  };
  return (
    <Choice
      label={t.view_label()}
      options={HOME_VIEWS}
      labels={labels}
      value={value}
      onChange={onChange}
    />
  );
}
