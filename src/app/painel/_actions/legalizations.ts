"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import {
  categoriaPT,
  emptyRequester,
  emptyVehicle,
  LEGALIZATION_STATUS,
  modelo9Missing,
  REQUESTER_FIELDS,
  tipoPT,
  VEHICLE_FIELDS,
  type Modelo9Requester,
  type Modelo9Vehicle,
} from "@/lib/modelo9";
import { formatPlate, isValidNif } from "@/lib/pt-validation";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { fillModelo9, modelo9FileName } from "@/server/modelo9";
import { getCompanyInfo } from "@/server/settings";
import { storeGenerated } from "@/server/storage";
import { run, UserError } from "@/server/action";

const txt = (max: number) => z.string().trim().max(max);
const requesterSchema = z
  .object({
    kind: z.enum(["empresa", "particular"]),
    ...Object.fromEntries(REQUESTER_FIELDS.map((f) => [f.key, txt(f.key === "address" || f.key === "name" ? 300 : 254)])),
  })
  .partial();
const vehicleSchema = z.object(Object.fromEntries(VEHICLE_FIELDS.map((f) => [f.key, txt(160)]))).partial();

const patchSchema = z.object({
  requester: requesterSchema.optional(),
  vehicle: vehicleSchema.optional(),
  vehicleId: z.string().max(60).nullable().optional(),
  status: z.enum(Object.keys(LEGALIZATION_STATUS) as [keyof typeof LEGALIZATION_STATUS, ...(keyof typeof LEGALIZATION_STATUS)[]]).optional(),
  notes: txt(4000).optional(),
  addFileIds: z.array(z.string().max(60)).max(20).optional(),
});

export type LegalizationPatch = z.input<typeof patchSchema>;

const FUEL_PT = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" } as const;
const isPtPlate = (plate: string) => /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/.test(formatPlate(plate));

async function companyRequester(): Promise<Modelo9Requester> {
  const c = await getCompanyInfo("sale");
  return { ...emptyRequester("empresa"), name: c.legalName, nif: c.nipc, certCode: c.certCode, address: c.address, postalCode: c.postalCode, city: c.city, email: c.email, phone: c.phone };
}

/** Novo processo (já com a empresa de vendas como requerente e, se vier de uma viatura, com os dados dela). */
export async function newLegalization(form: FormData): Promise<void> {
  const user = await assertPermission("forms.generate");
  const vehicleId = String(form.get("vehicleId") ?? "").trim() || null;
  const vehicle = emptyVehicle();
  if (vehicleId) {
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    const j = (v.vehicleType ?? "").match(/\b([MN][1-3G]{1,2})\b/i)?.[1]?.toUpperCase() ?? "";
    Object.assign(vehicle, {
      make: v.make,
      model: v.model,
      version: v.version,
      vin: v.vin ?? "",
      foreignPlate: v.plate && !isPtPlate(v.plate) ? v.plate : "",
      firstRegistration: v.firstRegistration ?? "",
      homologation: v.homologation ?? "",
      euCategory: j,
      color: v.color ?? "",
      fuel: v.fuel ? FUEL_PT[v.fuel] : "",
      engineCc: v.engineCc ? String(v.engineCc) : "",
      seats: v.seats ? String(v.seats) : "",
      grossWeightKg: v.grossWeightKg ? String(v.grossWeightKg) : "",
      tareKg: v.tareKg ? String(v.tareKg) : "",
      co2: v.co2 ? String(v.co2) : "",
    } satisfies Partial<Modelo9Vehicle>);
    vehicle.category = categoriaPT(vehicle);
    vehicle.purpose = tipoPT(vehicle);
  }
  const id = newId("leg");
  await db.insert(schema.legalizations).values({
    id,
    vehicleId,
    requester: { ...(await companyRequester()) },
    vehicle: { ...vehicle },
    createdBy: user.id,
  });
  await audit(user, { action: "legalization.create", entityType: "legalization", entityId: id, summary: "Abriu um processo de Modelo 9 e homologação" });
  revalidatePath("/painel/legalizacao");
  redirect(`/painel/legalizacao/${id}`);
}

/** Guarda o que foi escrito (o editor grava sozinho, aos poucos). */
export async function saveLegalization(id: string, raw: LegalizationPatch): Promise<ActionResult<{ updatedAt: string }>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const patch = patchSchema.parse(raw);
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const next: Partial<typeof schema.legalizations.$inferInsert> = { updatedAt: new Date() };
    if (patch.requester) next.requester = { ...row.requester, ...(patch.requester as Record<string, string>) };
    if (patch.vehicle) next.vehicle = { ...row.vehicle, ...(patch.vehicle as Record<string, string>) };
    if (patch.vehicleId !== undefined) {
      if (patch.vehicleId) {
        const [v] = await db.select({ id: schema.vehicles.id }).from(schema.vehicles).where(eq(schema.vehicles.id, patch.vehicleId)).limit(1);
        if (!v) throw new UserError("Viatura não encontrada.");
      }
      next.vehicleId = patch.vehicleId || null;
    }
    if (patch.status) next.status = patch.status;
    if (patch.notes !== undefined) next.notes = patch.notes || null;
    if (patch.addFileIds?.length) {
      const found = await db.select({ id: schema.files.id }).from(schema.files).where(inArray(schema.files.id, patch.addFileIds));
      next.fileIds = [...new Set([...row.fileIds, ...found.map((f) => f.id)])];
    }
    const [saved] = await db.update(schema.legalizations).set(next).where(eq(schema.legalizations.id, id)).returning({ updatedAt: schema.legalizations.updatedAt });
    return { updatedAt: saved.updatedAt.toISOString() };
  });
}

/** Gera o Modelo 9 em PDF com os dados guardados; nunca com campos obrigatórios em falta. */
export async function generateModelo9(id: string): Promise<ActionResult<{ url: string; fileId: string }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const requester = { ...emptyRequester(), ...row.requester } as Modelo9Requester;
    const vehicle = { ...emptyVehicle(), ...row.vehicle } as Modelo9Vehicle;
    const missing = modelo9Missing(requester, vehicle);
    if (missing.length) throw new UserError(`Falta preencher: ${missing.join(", ")}.`);
    const nif = requester.nif.replace(/\D/g, "");
    if (!isValidNif(nif)) throw new UserError("O NIF do requerente não é válido.");

    const pdf = await fillModelo9(requester, vehicle);
    const stored = await storeGenerated(pdf, "application/pdf", modelo9FileName(vehicle, requester), user.id);
    await db
      .update(schema.legalizations)
      .set({ modelo9FileId: stored.id, status: row.status === "draft" ? "generated" : row.status, updatedAt: new Date() })
      .where(eq(schema.legalizations.id, id));
    if (row.vehicleId)
      await db.insert(schema.documents).values({
        id: newId("doc"),
        ownerType: "vehicle",
        ownerId: row.vehicleId,
        kind: "modelo9",
        label: "Modelo 9 (IMT)",
        fileId: stored.id,
        extractionStatus: "none",
        uploadedBy: user.id,
      });
    await audit(user, {
      action: "legalization.modelo9",
      entityType: "legalization",
      entityId: id,
      summary: `Gerou o Modelo 9 de ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}${vehicle.foreignPlate ? ` (${vehicle.foreignPlate})` : ""} em nome de ${requester.name}`,
    });
    revalidatePath(`/painel/legalizacao/${id}`);
    revalidatePath("/painel/legalizacao");
    if (row.vehicleId) revalidatePath(`/painel/viaturas/${row.vehicleId}`);
    return { url: `/api/admin/files/${stored.id}`, fileId: stored.id };
  }, "Modelo 9 gerado.");
}

export async function deleteLegalization(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    await db.delete(schema.legalizations).where(eq(schema.legalizations.id, id));
    await audit(user, { action: "legalization.delete", entityType: "legalization", entityId: id, summary: "Apagou um processo de Modelo 9 (os ficheiros ficam guardados)" });
    revalidatePath("/painel/legalizacao");
  }, "Processo apagado.");
}
