/**
 * Importa / atualiza o stock da Tampinha Cars (tampinhacars.pt) no painel e no site.
 *   npm run parceiro:tampinha
 * Idempotente: viaturas já importadas são atualizadas (preço, km, vendido), não duplicadas.
 */
import { config } from "dotenv";
import { and, eq, notLike } from "drizzle-orm";

config({ path: [".env.local", ".env"], quiet: true });

const { createDb } = await import("../src/db/client");
const schema = await import("../src/db/schema");
const { syncTampinha } = await import("../src/server/partners/tampinha");

const db = createDb();
const [owner] = await db
  .select({ id: schema.users.id, name: schema.users.name })
  .from(schema.users)
  .where(and(eq(schema.users.roleId, "role_admin"), eq(schema.users.active, true), notLike(schema.users.name, "%Teste%")))
  .limit(1);
if (!owner) throw new Error("Não encontrei o utilizador dono (função Administrador).");

const t0 = Date.now();
const r = await syncTampinha({ userId: owner.id, log: (m) => console.log(m) });
console.log(
  `\n✓ Tampinha Cars: ${r.listed} anúncios · ${r.created} novas · ${r.updated} atualizadas · ${r.linked} ligadas a viaturas que já existiam · ${r.unpublished} retiradas do site · ${r.photos} fotografias (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
);
if (r.errors.length) console.log("Avisos:\n" + r.errors.map((e) => `- ${e}`).join("\n"));
