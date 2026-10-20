import type { ActivityKind } from "@pfa/core";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** What the filter controls show, as typed. Kept above the routes so it survives navigation. */
export interface FilterDraft {
  text: string;
  from: string;
  to: string;
  accountIds: string[];
  categoryId: string | undefined;
  tagIds: string[];
  kind: ActivityKind | "all";
  min: string;
  max: string;
  open: boolean;
}

export const EMPTY_DRAFT: FilterDraft = {
  text: "",
  from: "",
  to: "",
  accountIds: [],
  categoryId: undefined,
  tagIds: [],
  kind: "all",
  min: "",
  max: "",
  open: false,
};

interface FilterState {
  draft: FilterDraft;
  update: (patch: Partial<FilterDraft>) => void;
  clear: () => void;
}

const FilterContext = createContext<FilterState>({
  draft: EMPTY_DRAFT,
  update: () => {},
  clear: () => {},
});

/** Holds the Activity filter while the user moves between screens. */
export function ActivityFilterProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const value = useMemo<FilterState>(
    () => ({
      draft,
      update: (patch) => setDraft((current) => ({ ...current, ...patch })),
      // Clearing keeps the panel open or closed as it was.
      clear: () => setDraft((current) => ({ ...EMPTY_DRAFT, open: current.open })),
    }),
    [draft],
  );
  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useActivityFilter(): FilterState {
  return useContext(FilterContext);
}
