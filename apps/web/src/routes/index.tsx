import { createFileRoute } from "@tanstack/react-router";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { t } = useLocale();
  return <Page title={t.app_name()} />;
}
