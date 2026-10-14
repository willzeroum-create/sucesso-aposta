/** Ligação à base de dados: ficheiro local em desenvolvimento, Turso/libSQL remoto em produção. */
export function databaseConfig() {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.TURSO_DATABASE_URL?.trim() ||
    "file:./data/app.db";
  const authToken =
    process.env.DATABASE_AUTH_TOKEN?.trim() ||
    process.env.TURSO_AUTH_TOKEN?.trim() ||
    undefined;
  const remote = !url.startsWith("file:");
  return { url, authToken, remote };
}
