import { BALANCE_ADJUSTMENT_CATEGORY, type Category } from "@pfa/core";
import { useLocale } from "./locale";

/** Names a Category by id with its path, and covers the built-in and missing cases. */
export function useCategoryLabel(categories: readonly Category[]): (id: string) => string {
  const { t } = useLocale();
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (id) => {
    if (id === BALANCE_ADJUSTMENT_CATEGORY) return t.category_balance_adjustment();
    const category = byId.get(id);
    if (category === undefined) return t.category_missing();
    const names: string[] = [];
    for (
      let at: Category | undefined = category;
      at;
      at = at.parentId ? byId.get(at.parentId) : undefined
    )
      names.unshift(at.name);
    return names.join(" › ");
  };
}
