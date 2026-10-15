import "server-only";
import { createDb, type Db } from "./client";
import * as schema from "./schema";

export type { Db };
const globalForDb = globalThis as unknown as { __saDb?: Db };

function getDb(): Db {
  globalForDb.__saDb ??= createDb();
  return globalForDb.__saDb;
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
