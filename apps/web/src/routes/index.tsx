import { createFileRoute } from "@tanstack/react-router";
import { PROTOCOL_VERSION } from "@pfa/protocol";
import { AppearanceControls } from "../components/appearance";
import { Amount } from "../components/amount";
import { HideAmountsToggle } from "../components/hide-amounts";
import { LocaleControls, useLocale } from "../components/locale";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { t, money, date } = useLocale();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.preview_title()}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {t.preview_subtitle({ version: PROTOCOL_VERSION })}
        </p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="amounts">
        <h2 id="amounts" className="mb-3 font-medium">
          {t.section_amounts()}
        </h2>
        <ul className="flex flex-col gap-2">
          <li className="flex justify-between">
            <span>{t.sample_expense()}</span>
            <Amount direction="expense" variant="list" formatted={money(25000, "IDR")} />
          </li>
          <li className="flex justify-between">
            <span>{t.sample_income()}</span>
            <Amount direction="income" variant="list" formatted={money(8000000, "IDR")} />
          </li>
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span>{t.sample_total()}</span>
          <Amount direction="expense" variant="total" formatted={money(1250000, "IDR")} />
        </div>
        <div className="mt-3">
          <HideAmountsToggle />
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4" aria-labelledby="locale">
        <h2 id="locale" className="mb-3 font-medium">
          {t.section_language()}
        </h2>
        <LocaleControls />
        <p className="mt-4 text-sm text-ink-muted">{t.sample_date({ date: date("2026-10-18") })}</p>
      </section>

      <section
        className="rounded-xl border border-line bg-surface p-4"
        aria-labelledby="appearance"
      >
        <h2 id="appearance" className="mb-3 font-medium">
          {t.section_appearance()}
        </h2>
        <AppearanceControls />
        <p className="mt-4">
          <span className="inline-block rounded-md bg-danger px-2 py-1 text-sm text-on-danger">
            {t.badge_overdue()}
          </span>
        </p>
      </section>
    </main>
  );
}
