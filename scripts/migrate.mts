/** Cria/atualiza as tabelas no PostgreSQL (Supabase) e garante as funções base. Idempotente. */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPgClient } from "../src/db/client";
import * as schema from "../src/db/schema";
import { DEFAULT_ROLES } from "../src/server/auth/permissions";

config({ path: [".env.local", ".env"], quiet: true });

const client = createPgClient("migrations");
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });

// Funções base: cria as que faltam; nunca altera funções que o administrador já editou.
for (const role of DEFAULT_ROLES) {
  await db
    .insert(schema.roles)
    .values({ id: role.id, name: role.name, description: role.description, permissions: role.permissions, isSystem: role.isSystem ?? false })
    .onConflictDoNothing();
}
await db.update(schema.roles).set({ isSystem: true }).where(sql`${schema.roles.id} = 'role_admin'`);

const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
await client.end();
console.log("✓ Base de dados atualizada (PostgreSQL)");
if (!Number(n)) console.log('ℹ Ainda não há utilizadores. Crie o primeiro administrador: npm.cmd run admin:create -- utilizador "Nome"');
