/**
 * Cria (ou repõe) um administrador.
 *   npm.cmd run admin:create -- email@stand.pt "Nome Completo"
 *   (o login pode ser um e-mail ou um nome de utilizador; --manter-senha não obriga a trocar no 1.º acesso)
 * A palavra-passe temporária é mostrada uma única vez e tem de ser trocada no primeiro acesso.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { hashPassword } from "../src/server/auth/password";
import { newId } from "../src/server/ids";

config({ path: [".env.local", ".env"], quiet: true });

const args = process.argv.slice(2);
const keepPassword = args.includes("--manter-senha");
const [emailArg, ...nameParts] = args.filter((a) => a !== "--manter-senha");
const email = emailArg?.trim().toLowerCase();
const name = nameParts.join(" ").trim() || "Administrador";
if (!email || !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /^[a-z0-9._-]{3,60}$/.test(email))) {
  console.error('Uso: npm.cmd run admin:create -- email@stand.pt "Nome Completo"');
  process.exit(1);
}

const db = createDb();
const password = process.env.ADMIN_INITIAL_PASSWORD || `${randomBytes(9).toString("base64url")}9a`;
const passwordHash = await hashPassword(password);
const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
if (existing) {
  await db
    .update(schema.users)
    .set({ passwordHash, roleId: "role_admin", active: true, mustChangePassword: !keepPassword, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(schema.users.id, existing.id));
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, existing.id));
} else {
  await db.insert(schema.users).values({ id: newId("usr"), email, name, passwordHash, roleId: "role_admin", mustChangePassword: !keepPassword });
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
console.log(`✓ Administrador ${existing ? "reposto" : "criado"}: ${email}`);
if (!process.env.ADMIN_INITIAL_PASSWORD) console.log(`  Palavra-passe temporária (mostrada só agora): ${password}`);
if (!keepPassword) console.log("  Será pedida uma nova palavra-passe no primeiro acesso.");
