import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { opStoreContract } from "@pfa/core/store-contract";
import { createSqliteStore, type SqlDb } from "./sqlite-store";

const sqlite3 = await sqlite3InitModule();

/** The same SQLite engine the browser runs, in memory. The OPFS file is covered by the e2e test. */
function memoryDb(): SqlDb {
  const db = new sqlite3.oo1.DB(":memory:");
  return {
    async transaction(statements) {
      db.transaction(() => {
        for (const { sql, bind } of statements) db.exec({ sql, bind: bind ? [...bind] : [] });
      });
    },
    async column(sql) {
      return db.selectValues(sql).map(String);
    },
  };
}

opStoreContract("the SQLite store", async () => createSqliteStore(memoryDb()));
