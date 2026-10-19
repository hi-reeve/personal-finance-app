import { ACCOUNT_KINDS, currencyCodes, type AccountKind, type CurrencyCode } from "@pfa/core";
import { useState, type FormEvent } from "react";
import { LocaleControls, useLocale } from "../components/locale";
import { useApp } from "./app-provider";

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const KIND_LABEL = {
  cash: "kind_cash",
  bank: "kind_bank",
  ewallet: "kind_ewallet",
  "credit-card": "kind_credit-card",
  other: "kind_other",
} as const;

/** First run: language, base currency and the first Account. No sign-up. */
export function Welcome() {
  const { t, language } = useLocale();
  const app = useApp();
  const [currency, setCurrency] = useState<CurrencyCode>(language === "id" ? "IDR" : "USD");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("cash");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (app.status !== "ready") return;
    const trimmed = name.trim() || t.welcome_default_account();
    setSaving(true);
    setProblem(undefined);
    try {
      await app.completeSetup({
        baseCurrency: currency,
        account: { name: trimmed, kind, currency, openingBalance: 0 },
      });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.app_name()}</h1>
        <p className="mt-1 text-ink-muted">{t.welcome_intro()}</p>
      </header>

      <section aria-labelledby="welcome-language">
        <h2 id="welcome-language" className="mb-3 font-medium">
          {t.section_language()}
        </h2>
        <LocaleControls />
      </section>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <h2 className="font-medium">{t.welcome_account_heading()}</h2>
        <label className="flex flex-col gap-1">
          <span>{t.welcome_currency()}</span>
          <select
            className={FIELD}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          >
            {currencyCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.welcome_account_name()}</span>
          <input
            className={FIELD}
            value={name}
            placeholder={t.welcome_default_account()}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>{t.welcome_account_kind()}</span>
          <select
            className={FIELD}
            value={kind}
            onChange={(e) => setKind(e.target.value as AccountKind)}
          >
            {ACCOUNT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t[KIND_LABEL[k]]()}
              </option>
            ))}
          </select>
        </label>
        {problem !== undefined && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        <button
          type="submit"
          disabled={app.status !== "ready" || saving}
          className="min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t.welcome_start()}
        </button>
      </form>
    </main>
  );
}
