/** Aplica as migrações em ./drizzle (local ou Turso) e garante as funções base. Idempotente. */
import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/http";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createLibsqlClient, databaseConfig } from "../src/db/client";
import * as schema from "../src/db/schema";
import { DEFAULT_ROLES } from "../src/server/auth/permissions";

config({ path: [".env.local", ".env"], quiet: true });

const { url, remote } = databaseConfig();
if (!remote && process.env.VERCEL) {
  console.error("✗ Na Vercel é obrigatório um DATABASE_URL remoto (Turso).");
  process.exit(1);
}
if (!remote) mkdirSync("data", { recursive: true });

const client = createLibsqlClient();
if (!remote) await client.execute("PRAGMA journal_mode = WAL");
const db = drizzle(client, { schema });
await migrate(db, { migrationsFolder: "./drizzle" });

// Funções base: cria as que faltam; nunca altera funções que o administrador já editou.
for (const role of DEFAULT_ROLES) {
  await db
    .insert(schema.roles)
    .values({ id: role.id, name: role.name, description: role.description, permissions: role.permissions, isSystem: role.isSystem ?? false })
    .onConflictDoNothing();
}
// O administrador do sistema tem sempre todas as permissões.
await db.update(schema.roles).set({ isSystem: true }).where(sql`${schema.roles.id} = 'role_admin'`);

const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.users);
client.close();
console.log(`✓ Base de dados atualizada (${remote ? "remota" : url})`);
if (!Number(n)) console.log("ℹ Ainda não há utilizadores. Crie o primeiro administrador: npm.cmd run admin:create -- email@stand.pt \"Nome\"");
