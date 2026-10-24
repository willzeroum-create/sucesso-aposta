"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { emptyClient, type LegalClientData } from "@/lib/legalizacao";
import { formatPostalCodePt, isValidNif } from "@/lib/pt-validation";
import { audit, diff } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { run, UserError } from "@/server/action";

const txt = (max: number) => z.string().trim().max(max).optional().default("");
const clientSchema = z.object({
  kind: z.enum(["empresa", "particular"]).default("empresa"),
  name: z.string().trim().min(2, "Indique o nome ou a firma.").max(200),
  nif: txt(20).refine((v) => !v || isValidNif(v.replace(/\D/g, "")), "NIF inválido (dígito de controlo)."),
  docNumber: txt(60),
  certCode: txt(40),
  address: txt(300),
  postalCode: txt(20),
  city: txt(100),
  email: txt(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  phone: txt(30),
  notes: txt(2000),
});

const clean = (d: z.infer<typeof clientSchema>) => ({
  kind: d.kind,
  name: d.name.replace(/\s+/g, " "),
  nif: d.nif.replace(/\D/g, "") || null,
  docNumber: d.docNumber || null,
  certCode: d.certCode || null,
  address: d.address || null,
  postalCode: d.postalCode ? formatPostalCodePt(d.postalCode) : null,
  city: d.city || null,
  email: d.email.toLowerCase() || null,
  phone: d.phone || null,
  notes: d.notes || null,
});

async function assertNifFree(nif: string | null, exceptId?: string) {
  if (!nif) return;
  const [dup] = await db.select({ id: schema.legalClients.id, name: schema.legalClients.name }).from(schema.legalClients).where(eq(schema.legalClients.nif, nif)).limit(1);
  if (dup && dup.id !== exceptId) throw new UserError(`Já existe um cliente com este NIF: ${dup.name}.`, { nif: "NIF já registado." });
}

export async function createLegalClient(raw: Partial<LegalClientData>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const data = clean(clientSchema.parse({ ...emptyClient(), ...raw }));
    await assertNifFree(data.nif);
    const id = newId("lcl");
    await db.insert(schema.legalClients).values({ id, ...data, createdBy: user.id });
    await audit(user, { action: "legal_client.create", entityType: "legal_client", entityId: id, summary: `Criou o cliente de legalização ${data.name}` });
    revalidatePath("/painel/legalizacao");
    revalidatePath("/painel/legalizacao/clientes");
    return { id };
  }, "Cliente criado.");
}

export async function updateLegalClient(id: string, raw: Partial<LegalClientData>): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [before] = await db.select().from(schema.legalClients).where(eq(schema.legalClients.id, id)).limit(1);
    if (!before) throw new UserError("Cliente não encontrado.");
    const data = clean(clientSchema.parse({ ...emptyClient(), ...raw }));
    await assertNifFree(data.nif, id);
    await db.update(schema.legalClients).set({ ...data, updatedAt: new Date() }).where(eq(schema.legalClients.id, id));
    await audit(user, { action: "legal_client.update", entityType: "legal_client", entityId: id, summary: `Atualizou o cliente ${data.name}`, changes: diff(before, data) });
    revalidatePath(`/painel/legalizacao/clientes/${id}`);
    revalidatePath("/painel/legalizacao/clientes");
    revalidatePath("/painel/legalizacao");
  }, "Cliente guardado.");
}

/** Só se apaga um cliente sem carros (os carros e documentos legalizados ficam sempre guardados). */
export async function deleteLegalClient(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [c] = await db.select().from(schema.legalClients).where(eq(schema.legalClients.id, id)).limit(1);
    if (!c) throw new UserError("Cliente não encontrado.");
    const [{ n }] = await db.select({ n: count() }).from(schema.legalizations).where(eq(schema.legalizations.clientId, id));
    if (n > 0) throw new UserError(`${c.name} tem ${n} carro${n === 1 ? "" : "s"} na legalização. Apague ou passe esses carros para outro cliente primeiro.`);
    await db.delete(schema.legalClients).where(eq(schema.legalClients.id, id));
    await audit(user, { action: "legal_client.delete", entityType: "legal_client", entityId: id, summary: `Apagou o cliente de legalização ${c.name}` });
    revalidatePath("/painel/legalizacao/clientes");
    revalidatePath("/painel/legalizacao");
  }, "Cliente apagado.");
}
