import type { Op, OpStore } from "@pfa/core";

export type SqlValue = string | number;

/**
 * The little this store needs from a SQLite database. In the browser it is backed by a Worker that
 * owns the OPFS file; in tests it is an in-memory database.
 */
export interface SqlDb {
  /** Runs the statements in order as one transaction: all of them are applied, or none. */
  transaction(statements: readonly { sql: string; bind?: readonly SqlValue[] }[]): Promise<void>;
  /** The first column of every row the query returns, as text, in query order. */
  column(sql: string): Promise<string[]>;
}

const CREATE = `CREATE TABLE IF NOT EXISTS ops (
  seq INTEGER PRIMARY KEY,
  op TEXT NOT NULL
)`;

/** The op log in SQLite. One row per op, kept as JSON, read back in insertion order. */
export function createSqliteStore(db: SqlDb): OpStore {
  const ready = db.transaction([{ sql: CREATE }]);
  return {
    async append(ops: readonly Op[]) {
      await ready;
      if (ops.length === 0) return;
      await db.transaction(
        ops.map((op) => ({ sql: "INSERT INTO ops (op) VALUES (?)", bind: [JSON.stringify(op)] })),
      );
    },
    async readAll() {
      await ready;
      return (await db.column("SELECT op FROM ops ORDER BY seq")).map((json) => JSON.parse(json));
    },
  };
}
