import type { Category, CategoryKind } from "@pfa/core";
import { useId, useState } from "react";
import { useLocale } from "./locale";

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const OPTION =
  "flex min-h-11 w-full items-center rounded-lg border border-line px-3 text-start text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:font-semibold aria-pressed:text-accent";

function pathOf(category: Category, byId: Map<string, Category>): string {
  const names: string[] = [];
  for (
    let at: Category | undefined = category;
    at;
    at = at.parentId ? byId.get(at.parentId) : undefined
  )
    names.unshift(at.name);
  return names.join(" › ");
}

/**
 * Pick a Category by searching its name, or from the ones used lately. Deep trees stay usable
 * because every result shows its full path.
 */
export function CategoryPicker({
  categories,
  recent,
  value,
  onChange,
  kind,
  exclude,
  noneLabel,
}: {
  categories: readonly Category[];
  recent: readonly Category[];
  /** The chosen Category id; `undefined` is the "none" choice when `noneLabel` is given. */
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  kind?: CategoryKind;
  /** Ids that cannot be chosen, for example a Category and its descendants when moving it. */
  exclude?: ReadonlySet<string>;
  /** Adds a first choice that means "no Category", such as the top level. */
  noneLabel?: string;
}) {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const listId = useId();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const allowed = (c: Category) => (kind === undefined || c.kind === kind) && !exclude?.has(c.id);
  const needle = query.trim().toLowerCase();
  const results = categories.filter((c) => allowed(c) && c.name.toLowerCase().includes(needle));
  const recents = recent.filter(allowed);

  const option = (c: Category) => (
    <li key={c.id}>
      <button
        type="button"
        className={OPTION}
        aria-pressed={value === c.id}
        onClick={() => onChange(c.id)}
      >
        {pathOf(c, byId)}
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        className={FIELD}
        type="search"
        aria-label={t.picker_search()}
        placeholder={t.picker_search()}
        aria-controls={listId}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div id={listId} className="flex flex-col gap-3">
        {noneLabel !== undefined && needle === "" && (
          <button
            type="button"
            className={OPTION}
            aria-pressed={value === undefined}
            onClick={() => onChange(undefined)}
          >
            {noneLabel}
          </button>
        )}
        {needle === "" && recents.length > 0 && (
          <section aria-labelledby={`${listId}-recent`}>
            <h3 id={`${listId}-recent`} className="mb-1 text-sm font-medium text-ink-muted">
              {t.picker_recent()}
            </h3>
            <ul className="flex flex-col gap-1">{recents.map(option)}</ul>
          </section>
        )}
        <section aria-labelledby={`${listId}-all`}>
          <h3
            id={`${listId}-all`}
            className={needle === "" ? "mb-1 text-sm font-medium text-ink-muted" : "sr-only"}
          >
            {t.picker_all()}
          </h3>
          {results.length === 0 ? (
            <p className="text-ink-muted">{t.picker_none_found()}</p>
          ) : (
            <ul className="flex flex-col gap-1">{results.map(option)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
