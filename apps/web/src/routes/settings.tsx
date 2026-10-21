import { PROTOCOL_VERSION } from "@pfa/protocol";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Amount } from "../components/amount";
import { AppearanceControls, Choice } from "../components/appearance";
import { SyncedFormatControls } from "../components/format-controls";
import {
  HIDE_START_CHOICES,
  HideAmountsToggle,
  useHideAmounts,
  type HideStart,
} from "../components/hide-amounts";
import { LanguageChoice, useLocale } from "../components/locale";
import { Page } from "../components/page";
import { StorageSection } from "../components/storage-section";

export const Route = createFileRoute("/settings")({ component: Settings });

/** A section of settings, with plainly written where it is kept. */
function Section({
  id,
  title,
  scope,
  children,
}: {
  id: string;
  title: string;
  scope?: "synced" | "device";
  children: ReactNode;
}) {
  const { t } = useLocale();
  return (
    <section
      className="rounded-xl border border-line bg-surface p-4"
      aria-labelledby={id}
      aria-describedby={scope !== undefined ? `${id}-scope` : undefined}
    >
      <h2 id={id} className="font-medium">
        {title}
      </h2>
      {scope !== undefined && (
        <p id={`${id}-scope`} className="mb-3 text-sm text-ink-muted" data-scope={scope}>
          {scope === "synced" ? t.settings_scope_synced() : t.settings_scope_device()}
        </p>
      )}
      <div className={scope === undefined ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

function HideAmountsChoice() {
  const { t } = useLocale();
  const { start, setStart } = useHideAmounts();
  const labels: Record<HideStart, string> = {
    remember: t.hide_start_remember(),
    hidden: t.hide_start_hidden(),
    shown: t.hide_start_shown(),
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{t.settings_hide_note()}</p>
      <HideAmountsToggle />
      <Choice
        label={t.label_hide_start()}
        options={HIDE_START_CHOICES}
        labels={labels}
        value={start}
        onChange={setStart}
      />
    </div>
  );
}

function Settings() {
  const { t, money, date } = useLocale();
  return (
    <Page title={t.nav_settings()}>
      <p className="-mt-4 text-sm text-ink-muted">
        {t.preview_subtitle({ version: PROTOCOL_VERSION })}
      </p>

      <Section id="language" title={t.settings_language()} scope="device">
        <LanguageChoice />
      </Section>

      <Section id="formats" title={t.settings_numbers_dates()} scope="synced">
        <SyncedFormatControls />
      </Section>

      <Section id="appearance" title={t.section_appearance()} scope="device">
        <AppearanceControls />
        <p className="mt-4">
          <span className="inline-block rounded-md bg-danger px-2 py-1 text-sm text-on-danger">
            {t.badge_overdue()}
          </span>
        </p>
      </Section>

      <Section id="privacy" title={t.settings_privacy()} scope="device">
        <HideAmountsChoice />
      </Section>

      <Section id="amounts" title={t.section_amounts()}>
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
        <p className="mt-3 text-sm text-ink-muted">{t.sample_date({ date: date("2026-10-18") })}</p>
      </Section>

      <StorageSection />
    </Page>
  );
}
