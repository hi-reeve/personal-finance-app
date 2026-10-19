import sqlite3InitModule, { type OpfsSAHPoolDatabase } from "@sqlite.org/sqlite-wasm";
import type { Reply, Request } from "./protocol";

const POOL_NAME = "pfa";

/**
 * SQLite runs here, off the page's thread, on the OPFS "SAH pool" VFS. That VFS needs no special
 * HTTP headers (unlike the other OPFS VFS, which needs COOP/COEP), but one pool has one owner at a
 * time. Never pass `clearOnInit`: it empties the pool, and so the user's data, on start-up.
 */
const pool = sqlite3InitModule().then((sqlite3) =>
  sqlite3.installOpfsSAHPoolVfs({ name: POOL_NAME, directory: "/pfa-opfs", clearOnInit: false }),
);

const databases = new Map<string, Promise<OpfsSAHPoolDatabase>>();

function database(file: string): Promise<OpfsSAHPoolDatabase> {
  let db = databases.get(file);
  if (db === undefined) {
    // Cache the promise, not the result, so two first requests cannot open the file twice.
    db = pool.then((vfs) => new vfs.OpfsSAHPoolDb(`/${file}`));
    databases.set(file, db);
  }
  return db;
}

async function handle(request: Request): Promise<unknown> {
  const db = await database(request.file);
  switch (request.type) {
    case "transaction":
      db.transaction(() => {
        for (const { sql, bind } of request.statements) db.exec({ sql, bind: bind ?? [] });
      });
      return null;
    case "column":
      return db.selectValues(request.sql).map(String);
  }
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage(reply: Reply): void;
};

scope.onmessage = (event) => {
  const { id } = event.data;
  handle(event.data).then(
    (result) => scope.postMessage({ id, ok: true, result }),
    (error: unknown) =>
      scope.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
};
