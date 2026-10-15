/**
 * Ligação à base de dados: ficheiro local em desenvolvimento, Turso/libSQL remoto em produção.
 * Um DATABASE_URL Postgres (Supabase) é ignorado aqui: fica reservado para a migração para Postgres
 * e não pode partir a base de dados atual.
 */
const LIBSQL = /^(file:|libsql:|https?:|wss?:)/i;

export function databaseConfig() {
  const candidates = [process.env.DATABASE_URL, process.env.TURSO_DATABASE_URL].map((v) => v?.trim()).filter(Boolean) as string[];
  const url = candidates.find((v) => LIBSQL.test(v)) ?? "file:./data/app.db";
  const authToken =
    process.env.DATABASE_AUTH_TOKEN?.trim() ||
    process.env.TURSO_AUTH_TOKEN?.trim() ||
    undefined;
  const remote = !url.startsWith("file:");
  return { url, authToken, remote };
}
