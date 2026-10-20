import type { Category, CategoryKind, Tag } from "@pfa/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useApp, type ReadyState } from "../app/app-provider";
import { CategoryPicker } from "../components/category-picker";
import { useLocale } from "../components/locale";
import { Page } from "../components/page";

export const Route = createFileRoute("/categories")({ component: Categories });

const FIELD =
  "min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BUTTON =
  "min-h-11 rounded-lg border border-control px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY =
  "min-h-11 rounded-lg bg-accent px-4 font-medium text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

type Panel = { id: string; mode: "rename" | "move" | "merge" } | "new" | undefined;

function Categories() {
  const { t } = useLocale();
  const app = useApp();
  return app.status === "ready" ? <Manager app={app} /> : <Page title={t.nav_categories()} />;
}

/** Ids of a Category and everything inside it. */
function withDescendants(id: string, all: readonly Category[]): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const c of all)
      if (c.parentId !== undefined && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
  }
  return out;
}

function depthOf(category: Category, byId: Map<string, Category>): number {
  let depth = 0;
  for (let at = category.parentId; at !== undefined; at = byId.get(at)?.parentId) depth += 1;
  return depth;
}

/** Depth-first, so a parent is followed by its children. */
function inTreeOrder(all: readonly Category[]): Category[] {
  const children = new Map<string | undefined, Category[]>();
  for (const c of all) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const out: Category[] = [];
  const visit = (parent: string | undefined) => {
    for (const c of children.get(parent) ?? []) {
      out.push(c);
      visit(c.id);
    }
  };
  visit(undefined);
  return out;
}

function Manager({ app }: { app: ReadyState }) {
  const { t } = useLocale();
  const [panel, setPanel] = useState<Panel>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const close = () => setPanel(undefined);
  const byId = new Map(app.categories.map((c) => [c.id, c]));

  /** Resolves true when saved; on failure the panel stays open. */
  async function run(change: Parameters<typeof app.act>[0]): Promise<boolean> {
    setProblem(undefined);
    try {
      await app.act(change);
      return true;
    } catch (error) {
      setProblem(
        t.categories_failed({ message: error instanceof Error ? error.message : String(error) }),
      );
      return false;
    }
  }

  const group = (kind: CategoryKind, heading: string) => {
    const rows = inTreeOrder(app.categories.filter((c) => c.kind === kind));
    return (
      <section aria-labelledby={`h-${kind}`} className="flex flex-col gap-2">
        <h2 id={`h-${kind}`} className="font-medium">
          {heading}
        </h2>
        {rows.length === 0 ? (
          <p className="text-ink-muted">{t.categories_empty()}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}
      </section>
    );
  };

  function CategoryRow({ category }: { category: Category }) {
    const uses = app.categoryUse[category.id] ?? 0;
    const mode = typeof panel === "object" && panel.id === category.id ? panel.mode : undefined;
    const depth = depthOf(category, byId);
    return (
      <li
        className="rounded-xl border border-line bg-surface p-3"
        style={{ marginInlineStart: `${depth * 1.25}rem` }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 font-medium">{category.name}</span>
          {mode === undefined && (
            <>
              <button
                type="button"
                className={BUTTON}
                aria-label={`${t.categories_rename()}: ${category.name}`}
                onClick={() => setPanel({ id: category.id, mode: "rename" })}
              >
                {t.categories_rename()}
              </button>
              <button
                type="button"
                className={BUTTON}
                aria-label={`${t.categories_move()}: ${category.name}`}
                onClick={() => setPanel({ id: category.id, mode: "move" })}
              >
                {t.categories_move()}
              </button>
              <button
                type="button"
                className={BUTTON}
                aria-label={`${t.categories_merge()} ${category.name}`}
                onClick={() => setPanel({ id: category.id, mode: "merge" })}
              >
                {t.categories_merge()}
              </button>
              {uses === 0 && (
                <button
                  type="button"
                  className={BUTTON}
                  aria-label={`${t.categories_delete()}: ${category.name}`}
                  title={t.categories_delete_hint()}
                  onClick={() => run((engine) => engine.deleteCategory(category.id))}
                >
                  {t.categories_delete()}
                </button>
              )}
            </>
          )}
        </div>
        {mode === undefined && uses > 0 && (
          <p className="mt-1 text-sm text-ink-muted">{t.categories_in_use({ count: uses })}</p>
        )}
        {mode === "rename" && (
          <RenameForm
            initial={category.name}
            onCancel={close}
            onSave={async (name) => {
              if (await run((engine) => engine.editCategory(category.id, { name }))) close();
            }}
          />
        )}
        {mode === "move" && (
          <TargetForm
            category={category}
            exclude={withDescendants(category.id, app.categories)}
            noneLabel={t.categories_top_level()}
            onCancel={close}
            onApply={async (target) => {
              if (await run((engine) => engine.moveCategory(category.id, target))) close();
            }}
          />
        )}
        {mode === "merge" && (
          <TargetForm
            category={category}
            exclude={new Set([category.id])}
            onCancel={close}
            onApply={async (target) => {
              if (
                target !== undefined &&
                (await run((engine) => engine.mergeCategory(category.id, target)))
              )
                close();
            }}
          />
        )}
      </li>
    );
  }

  function TargetForm({
    category,
    exclude,
    noneLabel,
    onCancel,
    onApply,
  }: {
    category: Category;
    exclude: ReadonlySet<string>;
    noneLabel?: string;
    onCancel: () => void;
    onApply: (target: string | undefined) => Promise<void>;
  }) {
    const [target, setTarget] = useState<string | undefined>(
      noneLabel !== undefined ? category.parentId : undefined,
    );
    return (
      <div className="mt-3 flex flex-col gap-3">
        <CategoryPicker
          categories={app.categories}
          recent={[]}
          kind={category.kind}
          exclude={exclude}
          value={target}
          onChange={setTarget}
          {...(noneLabel !== undefined ? { noneLabel } : {})}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={PRIMARY}
            disabled={noneLabel === undefined && target === undefined}
            onClick={() => onApply(target)}
          >
            {t.categories_apply()}
          </button>
          <button type="button" className={BUTTON} onClick={onCancel}>
            {t.categories_cancel()}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Page title={t.nav_categories()}>
      {problem !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {group("expense", t.categories_expense())}
      {group("income", t.categories_income())}

      {panel === "new" ? (
        <NewCategoryForm
          categories={app.categories}
          onCancel={close}
          onSave={async (input) => {
            if (await run((engine) => engine.createCategory(input))) close();
          }}
        />
      ) : (
        <button type="button" className={BUTTON} onClick={() => setPanel("new")}>
          {t.categories_add()}
        </button>
      )}

      <TagsSection tags={app.tags} run={run} />
    </Page>
  );
}

function RenameForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState(initial);
  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSave(name);
      }}
    >
      <label className="flex flex-col gap-1">
        <span>{t.categories_name()}</span>
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY}>
          {t.categories_save()}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          {t.categories_cancel()}
        </button>
      </div>
    </form>
  );
}

function NewCategoryForm({
  categories,
  onSave,
  onCancel,
}: {
  categories: readonly Category[];
  onSave: (input: { name: string; kind: CategoryKind; parentId?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSave({ name, kind, ...(parentId !== undefined ? { parentId } : {}) });
      }}
    >
      <label className="flex flex-col gap-1">
        <span>{t.categories_name()}</span>
        <input className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t.categories_kind()}</span>
        <select
          className={FIELD}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as CategoryKind);
            setParentId(undefined);
          }}
        >
          <option value="expense">{t.categories_expense()}</option>
          <option value="income">{t.categories_income()}</option>
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1">{t.categories_parent()}</legend>
        <CategoryPicker
          categories={categories}
          recent={[]}
          kind={kind}
          value={parentId}
          onChange={setParentId}
          noneLabel={t.categories_top_level()}
        />
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={PRIMARY}>
          {t.categories_save()}
        </button>
        <button type="button" className={BUTTON} onClick={onCancel}>
          {t.categories_cancel()}
        </button>
      </div>
    </form>
  );
}

function TagsSection({
  tags,
  run,
}: {
  tags: readonly Tag[];
  run: (change: Parameters<ReadyState["act"]>[0]) => Promise<boolean>;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | undefined>(undefined);
  return (
    <section aria-labelledby="h-tags" className="flex flex-col gap-2">
      <h2 id="h-tags" className="font-medium">
        {t.tags_heading()}
      </h2>
      {tags.length === 0 ? (
        <p className="text-ink-muted">{t.tags_empty()}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((tag) => (
            <li key={tag.id} className="rounded-xl border border-line bg-surface p-3">
              {renaming === tag.id ? (
                <RenameForm
                  initial={tag.name}
                  onCancel={() => setRenaming(undefined)}
                  onSave={async (next) => {
                    if (await run((engine) => engine.renameTag(tag.id, next)))
                      setRenaming(undefined);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 font-medium">{tag.name}</span>
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label={t.tags_rename({ name: tag.name })}
                    onClick={() => setRenaming(tag.id)}
                  >
                    {t.categories_rename()}
                  </button>
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label={t.tags_delete({ name: tag.name })}
                    onClick={() => run((engine) => engine.deleteTag(tag.id))}
                  >
                    {t.categories_delete()}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (event: FormEvent) => {
          event.preventDefault();
          if (await run((engine) => engine.createTag(name))) setName("");
        }}
      >
        <input
          className={FIELD}
          aria-label={t.tags_name()}
          placeholder={t.tags_name()}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className={BUTTON}>
          {t.tags_add()}
        </button>
      </form>
    </section>
  );
}
