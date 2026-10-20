import {
  ACCOUNT_COLORS,
  ACCOUNT_ICONS,
  ACCOUNT_KINDS,
  currencyCodes,
  parseMoney,
  type AccountColor,
  type AccountIcon,
  type AccountKind,
  type AccountPatch,
  type CurrencyCode,
} from "@pfa/core";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useApp, type AccountView } from "../app/app-provider";
import { today } from "../app/today";
import { useLocale } from "./locale";

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BUTTON =
  "min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY =
  "min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span>{label}</span>
      {children}
    </label>
  );
}

function useExample(currency: CurrencyCode): string {
  const { money } = useLocale();
  return money(150_000, currency).replace(/^[^\d-]+/, "");
}

/** Add an Account (no `account`) or edit one. Opening balance is only asked for when adding. */
export function AccountForm({
  account,
  isDefault = false,
  onCancel,
  onSave,
}: {
  account?: AccountView;
  isDefault?: boolean;
  onCancel: () => void;
  onSave: (
    patch: AccountPatch & { openingBalance?: number },
    makeDefault: boolean,
  ) => Promise<void>;
}) {
  const { t, numberFormat } = useLocale();
  const app = useApp();
  const base = app.status === "ready" ? (app.settings.baseCurrency ?? "USD") : "USD";
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "cash");
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? base);
  const [opening, setOpening] = useState("");
  const [icon, setIcon] = useState<AccountIcon | "">(account?.icon ?? "");
  const [color, setColor] = useState<AccountColor | "">(account?.color ?? "");
  const [liability, setLiability] = useState(account?.isLiability ?? false);
  const [makeDefault, setMakeDefault] = useState(isDefault);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const example = useExample(currency);
  const lockId = useId();
  const locked = account?.hasHistory === true;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = account ? undefined : parseMoney(opening || "0", currency, { numberFormat });
    if (!account && amount === undefined) {
      setProblem(t.accounts_invalid_amount({ example }));
      return;
    }
    setProblem(undefined);
    await onSave(
      {
        name,
        kind,
        currency,
        isLiability: liability,
        icon,
        color,
        ...(amount !== undefined ? { openingBalance: amount } : {}),
      },
      makeDefault,
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
      <Field label={t.accounts_name()}>
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t.accounts_kind()}>
        <select
          className={FIELD}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as AccountKind;
            setKind(next);
            setLiability(next === "credit-card");
          }}
        >
          {ACCOUNT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t[`kind_${k}`]()}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.accounts_currency()}>
        <select
          className={FIELD}
          value={currency}
          disabled={locked}
          aria-describedby={locked ? lockId : undefined}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
        >
          {currencyCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </Field>
      {locked && (
        <p id={lockId} className="text-sm text-ink-muted">
          {t.accounts_currency_locked()}
        </p>
      )}
      {!account && (
        <Field label={t.accounts_opening()}>
          <input
            className={FIELD}
            inputMode="decimal"
            value={opening}
            placeholder="0"
            onChange={(e) => setOpening(e.target.value)}
          />
        </Field>
      )}
      <Field label={t.accounts_icon()}>
        <select
          className={FIELD}
          value={icon}
          onChange={(e) => setIcon(e.target.value as AccountIcon | "")}
        >
          <option value="">{t.accounts_none()}</option>
          {ACCOUNT_ICONS.map((i) => (
            <option key={i} value={i}>
              {t[`icon_${i}`]()}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.accounts_color()}>
        <select
          className={FIELD}
          value={color}
          onChange={(e) => setColor(e.target.value as AccountColor | "")}
        >
          <option value="">{t.accounts_none()}</option>
          {ACCOUNT_COLORS.map((c) => (
            <option key={c} value={c}>
              {t[`color_${c}`]()}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={liability}
          onChange={(e) => setLiability(e.target.checked)}
        />
        <span>{t.accounts_liability()}</span>
      </label>
      {account && (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
          <span>{t.accounts_default()}</span>
        </label>
      )}
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY}>
          {t.accounts_save()}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          {t.accounts_cancel()}
        </button>
      </div>
    </form>
  );
}

/** Asks what the balance should be and records the difference as a balance adjustment. */
export function AdjustForm({
  account,
  onCancel,
  onApply,
}: {
  account: AccountView;
  onCancel: () => void;
  onApply: (target: number, date: string) => Promise<void>;
}) {
  const { t, numberFormat } = useLocale();
  const [target, setTarget] = useState("");
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const example = useExample(account.currency);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = parseMoney(target, account.currency, { numberFormat });
    if (amount === undefined) {
      setProblem(t.accounts_invalid_amount({ example }));
      return;
    }
    setProblem(undefined);
    await onApply(amount, today());
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-4">
      <Field label={t.accounts_adjust_target()}>
        <input
          className={FIELD}
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </Field>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY}>
          {t.accounts_adjust_apply()}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          {t.accounts_cancel()}
        </button>
      </div>
    </form>
  );
}
