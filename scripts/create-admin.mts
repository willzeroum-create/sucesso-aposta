/**
 * Cria (ou repõe) um administrador.
 *   npm.cmd run admin:create -- email@stand.pt "Nome Completo"
 * A palavra-passe temporária é mostrada uma única vez e tem de ser trocada no primeiro acesso.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql/http";
import { createLibsqlClient } from "../src/db/client";
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { newId } from "../src/server/ids";

config({ path: [".env.local", ".env"], quiet: true });

const [emailArg, ...nameParts] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
const name = nameParts.join(" ").trim() || "Administrador";
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm.cmd run admin:create -- email@stand.pt "Nome Completo"');
  process.exit(1);
}

const client = createLibsqlClient();
const db = drizzle(client, { schema });
const password = process.env.ADMIN_INITIAL_PASSWORD || `${randomBytes(9).toString("base64url")}9a`;
const passwordHash = await hashPassword(password);
const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
if (existing) {
  await db
    .update(schema.users)
    .set({ passwordHash, roleId: "role_admin", active: true, mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(schema.users.id, existing.id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, existing.id));
} else {
  await db.insert(schema.users).values({ id: newId("usr"), email, name, passwordHash, roleId: "role_admin", mustChangePassword: true });
}
await db.insert(schema.auditLogs).values({
  id: newId("log"),
  userId: null,
  userName: "Sistema",
  action: existing ? "user.reset_admin" : "user.create_admin",
  entityType: "user",
  entityId: email,
  summary: `${existing ? "Acesso de administrador reposto" : "Administrador criado"} pela linha de comandos: ${email}`,
});
client.close();
console.log(`✓ Administrador ${existing ? "reposto" : "criado"}: ${email}`);
if (!process.env.ADMIN_INITIAL_PASSWORD) console.log(`  Palavra-passe temporária (mostrada só agora): ${password}`);
console.log("  Será pedida uma nova palavra-passe no primeiro acesso.");
