import type { OpStore } from "@pfa/core";
import type { Reply, Request } from "./protocol";
import { createSqliteStore, type SqlDb } from "./sqlite-store";

type Call = Request extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (e: Error) => void }
>();

function connect(): Worker {
  if (worker !== undefined) return worker;
  const created = new Worker(new URL("./sqlite.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<Reply>) => {
    const waiting = pending.get(event.data.id);
    if (waiting === undefined) return;
    pending.delete(event.data.id);
    if (event.data.ok) waiting.resolve(event.data.result);
    else waiting.reject(new Error(event.data.error));
  };
  created.onerror = (event) => {
    const error = new Error(event.message || "The storage worker failed to start");
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
    worker = undefined;
  };
  worker = created;
  return created;
}

function call(message: Call): Promise<unknown> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    connect().postMessage({ ...message, id });
  });
}

/** A database file in the browser's private file system, reached through the storage worker. */
function opfsDb(file: string): SqlDb {
  return {
    async transaction(statements) {
      await call({
        type: "transaction",
        file,
        statements: statements.map(({ sql, bind }) => ({ sql, ...(bind && { bind: [...bind] }) })),
      });
    },
    async column(sql) {
      return (await call({ type: "column", file, sql })) as string[];
    },
  };
}

/** The op log for this browser profile. Survives reloads; see `requestPersistence` for eviction. */
export function openWebStore(file = "pfa.sqlite3"): OpStore {
  return createSqliteStore(opfsDb(file));
}
