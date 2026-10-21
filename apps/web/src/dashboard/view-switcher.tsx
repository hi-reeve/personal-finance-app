import { useCallback, useState } from "react";
import { Choice } from "../components/appearance";
import { useLocale } from "../components/locale";

export const HOME_VIEWS = ["summary", "overview", "categories"] as const;
export type HomeView = (typeof HOME_VIEWS)[number];

const KEY = "pfa.homeView";

/** From a tablet up there is room for the dense Overview; a phone starts on the Summary. */
const WIDE = "(min-width: 768px)";

function usualView(): HomeView {
  try {
    return window.matchMedia(WIDE).matches ? "overview" : "summary";
  } catch {
    return "summary";
  }
}

/** The view chosen on this device if there is one, else the usual one for this screen. */
function readView(): HomeView {
  try {
    const stored = localStorage.getItem(KEY);
    if (HOME_VIEWS.includes(stored as HomeView)) return stored as HomeView;
  } catch {
    // Fall through to the usual view.
  }
  return usualView();
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
    overview: t.view_overview(),
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
