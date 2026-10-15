/**
 * Ligação à base de dados PostgreSQL do Supabase pela API (PostgREST), só com o URL do projeto e a chave
 * de servidor — sem a palavra-passe da base de dados. As consultas passam pela função `sa_exec`
 * (supabase/setup.sql), que só a chave de servidor pode executar.
 */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

export function supabaseConfig(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/(rest|storage)\/v1\/?$/, "").replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url) throw new DatabaseConfigError("SUPABASE_URL não está definido. Ver .env.example.");
  if (!key) throw new DatabaseConfigError("SUPABASE_SERVICE_ROLE_KEY não está definido. Ver .env.example.");
  return { url, key };
}
