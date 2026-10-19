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

const LOCK = "pfa-storage";
let lock: Promise<void> | undefined;

/**
 * Only one tab may own the database. The SAH pool VFS cannot be shared, and a second tab that tries
 * to start it can wipe the pool. So take a Web Lock first, hold it for the life of the tab, and refuse
 * to start the worker if another tab has it.
 */
function claimDatabase(): Promise<void> {
  lock ??= new Promise<void>((resolve, reject) => {
    if (!navigator.locks) return resolve();
    void navigator.locks.request(LOCK, { ifAvailable: true }, (held) => {
      if (held === null) {
        reject(new Error("Another tab already has your data open. Close it and try again."));
        return;
      }
      resolve();
      return new Promise<never>(() => {});
    });
  });
  return lock;
}

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
  const fail = (message: string) => {
    const error = new Error(message);
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
    created.terminate();
    worker = undefined;
  };
  created.onerror = (event) => fail(event.message || "The storage worker failed to start");
  created.onmessageerror = () => fail("The storage worker sent a message that could not be read");
  worker = created;
  return created;
}

async function call(message: Call): Promise<unknown> {
  await claimDatabase();
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
