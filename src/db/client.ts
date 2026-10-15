import postgres from "postgres";
import { databaseUrl, migrationsUrl } from "./config";

export { databaseUrl, migrationsUrl, DatabaseConfigError } from "./config";

/**
 * Cliente postgres.js. O pooler de transações do Supabase não suporta prepared statements,
 * por isso `prepare: false`. Em serverless, poucas ligações por instância.
 */
export function createPgClient(kind: "app" | "migrations" = "app") {
  const url = kind === "app" ? databaseUrl() : migrationsUrl();
  return postgres(url, {
    prepare: false,
    max: kind === "app" ? (process.env.VERCEL ? 3 : 8) : 1,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
}
