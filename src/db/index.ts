import "server-only";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql/http";
import type { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { createLibsqlClient } from "./client";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { __saClient?: Client; __saDb?: Db };

function getDb(): Db {
  if (globalForDb.__saDb) return globalForDb.__saDb;
  const client = globalForDb.__saClient ?? createLibsqlClient();
  globalForDb.__saClient = client;
  if (!client.protocol || client.protocol === "file") {
    // WAL + chaves estrangeiras no ficheiro local (no Turso já estão ativas).
    void client.execute("PRAGMA foreign_keys = ON").catch(() => {});
    void client.execute("PRAGMA busy_timeout = 5000").catch(() => {});
  }
  const instance = drizzle(client, { schema });
  globalForDb.__saDb = instance;
  return instance;
}

/** Ligação criada no primeiro uso, não ao importar (o build não precisa de base de dados). */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
