/** Cria/atualiza as tabelas no Supabase (pela API, sem palavra-passe) e garante as funções base. Idempotente. */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pg-proxy/migrator";
import { createDb, runSql } from "../src/db/client";
import * as schema from "../src/db/schema";
import { DEFAULT_ROLES } from "../src/server/auth/permissions";

config({ path: [".env.local", ".env"], quiet: true });

const db = createDb();
await migrate(db, async (queries) => {
  for (const q of queries) await runSql(q);
}, { migrationsFolder: "./drizzle" });

// As tabelas não ficam expostas na API pública do Supabase: só a chave de servidor (via sa_exec) lhes acede.
await runSql(`do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', r.tablename);
  end loop;
end $$`);

for (const role of DEFAULT_ROLES) {
  await db
    .insert(schema.roles)
    .values({ id: role.id, name: role.name, description: role.description, permissions: role.permissions, isSystem: role.isSystem ?? false })
    .onConflictDoNothing();
}
await db.update(schema.roles).set({ isSystem: true }).where(sql`${schema.roles.id} = 'role_admin'`);

const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
console.log("✓ Base de dados atualizada (Supabase)");
if (!Number(n)) console.log('ℹ Ainda não há utilizadores. Crie o primeiro: npm.cmd run admin:create -- utilizador "Nome"');
