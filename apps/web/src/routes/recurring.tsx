import { createFileRoute } from "@tanstack/react-router";
import { Page } from "../components/page";
import { useLocale } from "../components/locale";

export const Route = createFileRoute("/recurring")({ component: Screen });

function Screen() {
  const { t } = useLocale();
  return <Page title={t.nav_recurring()} />;
}
