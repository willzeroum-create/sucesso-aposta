/**
 * Ligação à base de dados PostgreSQL (Supabase).
 *  - DATABASE_URL: pooler de transações (porta 6543) — usado pelo site e pelo painel, também na Vercel.
 *  - DATABASE_URL_MIGRATIONS: pooler de sessão (porta 5432) — usado só para criar/alterar tabelas.
 */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

function check(url: string | undefined, name: string): string {
  const value = url?.trim();
  if (!value) throw new DatabaseConfigError(`${name} não está definido. Ver .env.example.`);
  if (!/^postgres(ql)?:\/\//i.test(value)) throw new DatabaseConfigError(`${name} tem de ser um endereço postgresql:// (Supabase → Connect).`);
  if (value.includes("[YOUR-PASSWORD]")) throw new DatabaseConfigError(`${name} ainda tem [YOUR-PASSWORD]: substitua pela palavra-passe da base de dados.`);
  return value;
}

export function databaseUrl(): string {
  return check(process.env.DATABASE_URL, "DATABASE_URL");
}

export function migrationsUrl(): string {
  return check(process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL, "DATABASE_URL_MIGRATIONS");
}
