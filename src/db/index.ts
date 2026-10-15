import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createPgClient } from "./client";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
const globalForDb = globalThis as unknown as { __saDb?: Db };

function getDb(): Db {
  if (globalForDb.__saDb) return globalForDb.__saDb;
  const instance = drizzle(createPgClient("app"), { schema });
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
