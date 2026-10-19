import type { ReactNode } from "react";

/** Standard screen container: one h1, readable width. */
export function Page({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
