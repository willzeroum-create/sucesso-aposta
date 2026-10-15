/**
 * Define a palavra-passe de uma conta existente (login = e-mail ou utilizador), sem a mostrar.
 * Lê SET_LOGIN e SET_PASSWORD do ambiente; desbloqueia a conta e termina as sessões abertas.
 *   (usado pela janela scripts/definir-senha.ps1)
 */
import { config } from "dotenv";
import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { createPgClient } from "../src/db/client";
import * as schema from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/server/auth/password";
import { newId } from "../src/server/ids";

config({ path: [".env.local", ".env"], quiet: true });

const login = (process.env.SET_LOGIN ?? "").trim().toLowerCase();
const password = process.env.SET_PASSWORD ?? "";
if (!login || !password) {
  console.error("Falta o login ou a palavra-passe.");
  process.exit(1);
}

const client = createPgClient("migrations");
const db = drizzle(client, { schema });
const [user] = await db.select().from(schema.users).where(eq(schema.users.email, login)).limit(1);
if (!user) {
  console.error(`Não existe nenhuma conta com o login "${login}".`);
  process.exit(2);
}
const passwordHash = await hashPassword(password);
await db
  .update(schema.users)
  .set({ passwordHash, failedLogins: 0, lockedUntil: null, mustChangePassword: false, active: true, updatedAt: new Date() })
  .where(eq(schema.users.id, user.id));
await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
await db.delete(schema.rateLimits).where(like(schema.rateLimits.key, "login:%"));
await db.insert(schema.auditLogs).values({
  id: newId("log"),
  userId: user.id,
  userName: "Sistema",
  action: "user.password_reset",
  entityType: "user",
  entityId: user.id,
  summary: `Palavra-passe de ${user.name} definida pela linha de comandos`,
});
const ok = await verifyPassword(password, passwordHash);
await client.end();
console.log(ok ? `OK: palavra-passe de "${login}" gravada e confirmada.` : "ERRO na confirmação.");
