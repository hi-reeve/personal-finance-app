import { Link, createFileRoute } from "@tanstack/react-router";
import { useLocale } from "../components/locale";
import { MORE_LIST } from "../components/nav-items";
import { Page } from "../components/page";

export const Route = createFileRoute("/more")({ component: More });

function More() {
  const { t } = useLocale();
  return (
    <Page title={t.nav_more()}>
      <ul className="flex flex-col gap-2">
        {MORE_LIST.map((d) => (
          <li key={d.to}>
            <Link
              to={d.to}
              className="flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {t[d.label]()}
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
