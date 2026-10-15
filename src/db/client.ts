import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import { supabaseConfig } from "./config";
import * as schema from "./schema";

export { supabaseConfig, DatabaseConfigError } from "./config";

export class DatabaseError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "DatabaseError";
  }
}

/** Valor → literal SQL. Uma única passagem sobre a consulta original (gerada pelo Drizzle, nunca por utilizadores). */
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new DatabaseError("Número inválido na consulta.");
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes("\u0000")) throw new DatabaseError("Texto com carácter inválido.");
  return `'${text.replace(/'/g, "''")}'`;
}

export function inlineParams(query: string, params: unknown[]): string {
  if (!params.length) return query;
  return query.replace(/\$(\d+)/g, (m, n: string) => {
    const i = Number(n) - 1;
    return i >= 0 && i < params.length ? literal(params[i]) : m;
  });
}

/** Executa SQL no Supabase através de POST /rest/v1/rpc/sa_exec. */
export async function runSql(query: string, params: unknown[] = [], arrayMode = false): Promise<unknown[]> {
  const { url, key } = supabaseConfig();
  let res: Response;
  try {
    res = await fetch(`${url}/rest/v1/rpc/sa_exec`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: inlineParams(query, params), array_mode: arrayMode }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new DatabaseError("Sem ligação ao Supabase.");
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const e = body as { message?: string; code?: string; hint?: string } | null;
    if (e?.code === "PGRST202") throw new DatabaseError("Falta a função sa_exec no Supabase: cole supabase/setup.sql no SQL Editor e carregue em Run.", e.code);
    throw new DatabaseError(`Base de dados: ${e?.message ?? `HTTP ${res.status}`}`, e?.code);
  }
  return Array.isArray(body) ? body : [];
}

export type Db = PgRemoteDatabase<typeof schema>;

/** Drizzle sobre a API do Supabase ("all" → linhas em lista ordenada; "execute" → objetos). */
export function createDb(): Db {
  return drizzle(async (query, params, method) => ({ rows: await runSql(query, params, method === "all") }), { schema });
}
