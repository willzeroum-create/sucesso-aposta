"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { isValidNif } from "@/lib/pt-validation";
import {
  emptyParty,
  emptyRegistrationVehicle,
  PARTY_FIELDS,
  REGISTRATION_STATUS,
  VEHICLE_FIELDS_RA,
  type RegistrationParty,
  type RegistrationVehicle,
} from "@/lib/registo";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { fillRegistration, registrationFileName } from "@/server/registo-pdf";
import { getCompanyInfo } from "@/server/settings";
import { storeGenerated } from "@/server/storage";
import { run, UserError } from "@/server/action";

const txt = (max: number) => z.string().trim().max(max);
const partySchema = z
  .object({
    kind: z.enum(["empresa", "particular"]),
    docType: z.enum(["cc", "bi", "cp", "outro"]),
    ...Object.fromEntries(PARTY_FIELDS.map((f) => [f.key, txt(f.key === "address" || f.key === "name" ? 300 : 254)])),
  })
  .partial();
const vehicleSchema = z.object(Object.fromEntries(VEHICLE_FIELDS_RA.map((f) => [f.key, txt(120)]))).partial();
type StatusKey = keyof typeof REGISTRATION_STATUS;

const patchSchema = z.object({
  buyer: partySchema.optional(),
  seller: partySchema.optional(),
  vehicle: vehicleSchema.optional(),
  contractDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.").optional(),
  vehicleId: z.string().max(60).nullable().optional(),
  status: z.enum(Object.keys(REGISTRATION_STATUS) as [StatusKey, ...StatusKey[]]).optional(),
  notes: txt(4000).optional(),
  addFileIds: z.array(z.string().max(60)).max(20).optional(),
});
export type RegistrationPatch = z.input<typeof patchSchema>;

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

/** Novo processo de compra e venda. Por omissão o stand (empresa de vendas) é o vendedor. */
export async function newRegistration(form: FormData): Promise<void> {
  const user = await assertPermission("forms.generate");
  const vehicleId = String(form.get("vehicleId") ?? "").trim() || null;
  const vehicle: RegistrationVehicle = emptyRegistrationVehicle();
  if (vehicleId) {
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    Object.assign(vehicle, { plate: v.plate ?? "", make: v.make, model: v.model, vin: v.vin ?? "" });
  }
  const c = await getCompanyInfo("sale");
  const seller: RegistrationParty = { ...emptyParty("empresa"), name: c.legalName, nif: c.nipc, certCode: c.certCode, address: c.address, postalCode: c.postalCode, city: c.city, email: c.email };
  const id = newId("reg");
  await db.insert(schema.registrations).values({
    id,
    vehicleId,
    buyer: { ...emptyParty("particular") },
    seller: { ...seller },
    vehicle: { ...vehicle },
    contractDate: today(),
    createdBy: user.id,
  });
  await audit(user, { action: "registration.create", entityType: "registration", entityId: id, summary: "Abriu um requerimento de registo (compra e venda)" });
  revalidatePath("/painel/registo");
  redirect(`/painel/registo/${id}`);
}

export async function saveRegistration(id: string, raw: RegistrationPatch): Promise<ActionResult<{ updatedAt: string }>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const patch = patchSchema.parse(raw);
    const [row] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const next: Partial<typeof schema.registrations.$inferInsert> = { updatedAt: new Date() };
    if (patch.buyer) next.buyer = { ...row.buyer, ...(patch.buyer as Record<string, string>) };
    if (patch.seller) next.seller = { ...row.seller, ...(patch.seller as Record<string, string>) };
    if (patch.vehicle) next.vehicle = { ...row.vehicle, ...(patch.vehicle as Record<string, string>) };
    if (patch.contractDate !== undefined) next.contractDate = patch.contractDate || null;
    if (patch.vehicleId !== undefined) next.vehicleId = patch.vehicleId || null;
    if (patch.status) next.status = patch.status;
    if (patch.notes !== undefined) next.notes = patch.notes || null;
    if (patch.addFileIds?.length) {
      const found = await db.select({ id: schema.files.id }).from(schema.files).where(inArray(schema.files.id, patch.addFileIds));
      next.fileIds = [...new Set([...row.fileIds, ...found.map((f) => f.id)])];
    }
    const [saved] = await db.update(schema.registrations).set(next).where(eq(schema.registrations.id, id)).returning({ updatedAt: schema.registrations.updatedAt });
    return { updatedAt: saved.updatedAt.toISOString() };
  });
}

/**
 * Gera o requerimento oficial com o que houver (PDF editável). O que faltar sai em branco para completar
 * à mão depois de imprimir (ex.: só o documento do comprador, ou só a matrícula).
 */
export async function generateRegistration(id: string): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [row] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const buyer = { ...emptyParty(), ...row.buyer } as RegistrationParty;
    const seller = { ...emptyParty(), ...row.seller } as RegistrationParty;
    const vehicle = { ...emptyRegistrationVehicle(), ...row.vehicle } as RegistrationVehicle;
    const contractDate = row.contractDate ?? "";
    // Só se trava um NIF escrito e errado: o que está vazio fica em branco no papel.
    for (const [role, p] of [["comprador", buyer], ["vendedor", seller]] as const) {
      const nif = p.nif.replace(/\D/g, "");
      if (nif && !isValidNif(nif)) throw new UserError(`O NIF do ${role} não é válido. Corrija-o ou apague-o para escrever à mão.`);
    }

    const pdf = await fillRegistration({ buyer, seller, vehicle, contractDate });
    const stored = await storeGenerated(pdf, "application/pdf", registrationFileName(vehicle, buyer), user.id);
    await db
      .update(schema.registrations)
      .set({ generatedFileId: stored.id, status: row.status === "draft" ? "generated" : row.status, updatedAt: new Date() })
      .where(eq(schema.registrations.id, id));
    if (row.vehicleId)
      await db.insert(schema.documents).values({
        id: newId("doc"),
        ownerType: "vehicle",
        ownerId: row.vehicleId,
        kind: "registo",
        label: "Requerimento de registo automóvel",
        fileId: stored.id,
        uploadedBy: user.id,
      });
    await audit(user, {
      action: "registration.generate",
      entityType: "registration",
      entityId: id,
      summary: `Gerou o requerimento de registo de ${vehicle.plate || vehicle.make || "viatura"}: ${seller.name || "vendedor por preencher"} → ${buyer.name || "comprador por preencher"}`,
    });
    revalidatePath(`/painel/registo/${id}`);
    revalidatePath("/painel/registo");
    if (row.vehicleId) revalidatePath(`/painel/viaturas/${row.vehicleId}`);
    return { url: `/api/admin/files/${stored.id}` };
  }, "Requerimento gerado.");
}

export async function deleteRegistration(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    await db.delete(schema.registrations).where(eq(schema.registrations.id, id));
    await audit(user, { action: "registration.delete", entityType: "registration", entityId: id, summary: "Apagou um processo de compra e venda (os ficheiros ficam guardados)" });
    revalidatePath("/painel/registo");
  }, "Processo apagado.");
}
