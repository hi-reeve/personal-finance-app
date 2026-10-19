import type { ReactNode } from "react";
import { useLocale } from "../components/locale";
import { useApp } from "./app-provider";
import { Welcome } from "./welcome";

/** Shows the app once the user's data is open and set up; otherwise loading, an error, or first run. */
export function AppGate({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const app = useApp();

  if (app.status === "loading") {
    return (
      <p role="status" className="p-6 text-ink-muted">
        {t.app_loading()}
      </p>
    );
  }
  if (app.status === "error") {
    return (
      <p role="alert" className="p-6 text-danger">
        {t.app_error({ message: app.message })}
      </p>
    );
  }
  if (app.settings.baseCurrency === undefined) return <Welcome />;
  return <>{children}</>;
}
