import type { SqlValue } from "./sqlite-store";

/** Messages between the page and the Worker that owns the database file. */
export type Request =
  | { id: number; type: "open"; file: string }
  | {
      id: number;
      type: "transaction";
      file: string;
      statements: { sql: string; bind?: SqlValue[] }[];
    }
  | { id: number; type: "column"; file: string; sql: string };

export type Reply =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };
