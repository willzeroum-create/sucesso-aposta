"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { DOCUMENT_KINDS } from "@/lib/document-kinds";
import { clientToRequester, CUSTOMS_KEYS, REGISTRATION_KEYS, STAGE_LABEL, STAGES, type Stage } from "@/lib/legalizacao";
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
import { formatPlate, formatPostalCodePt, isValidNif } from "@/lib/pt-validation";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { fillModelo9, modelo9FileName } from "@/server/modelo9";
import { getCompanyInfo } from "@/server/settings";
import { removeFile, storeGenerated } from "@/server/storage";
import { run, UserError } from "@/server/action";

const txt = (max: number) => z.string().trim().max(max);
const isoOrEmpty = z.string().trim().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.");
const requesterSchema = z
  .object({
    kind: z.enum(["empresa", "particular"]),
    ...Object.fromEntries(REQUESTER_FIELDS.map((f) => [f.key, txt(f.key === "address" || f.key === "name" ? 300 : 254)])),
  })
  .partial();
const vehicleSchema = z.object(Object.fromEntries(VEHICLE_FIELDS.map((f) => [f.key, txt(160)]))).partial();
const customsSchema = z.object(Object.fromEntries(CUSTOMS_KEYS.map((k) => [k, txt(400)]))).partial();
const registrationSchema = z.object(Object.fromEntries(REGISTRATION_KEYS.map((k) => [k, txt(300)]))).partial();

const patchSchema = z.object({
  requester: requesterSchema.optional(),
  vehicle: vehicleSchema.optional(),
  vehicleId: z.string().max(60).nullable().optional(),
  clientId: z.string().max(60).nullable().optional(),
  stage: z.enum(STAGES).optional(),
  entryDate: isoOrEmpty.optional(),
  customs: customsSchema.optional(),
  registration: registrationSchema.optional(),
  status: z.enum(Object.keys(LEGALIZATION_STATUS) as [keyof typeof LEGALIZATION_STATUS, ...(keyof typeof LEGALIZATION_STATUS)[]]).optional(),
  notes: txt(4000).optional(),
  addFileIds: z.array(z.string().max(60)).max(20).optional(),
});

export type LegalizationPatch = z.input<typeof patchSchema>;

const FUEL_PT = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" } as const;
const isPtPlate = (plate: string) => /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/.test(formatPlate(plate));

function revalidateLegalization(id: string, clientId?: string | null) {
  revalidatePath(`/painel/legalizacao/${id}`);
  revalidatePath("/painel/legalizacao");
  revalidatePath("/painel/legalizacao/registo-inicial");
  if (clientId) revalidatePath(`/painel/legalizacao/clientes/${clientId}`);
}

async function companyRequester(): Promise<Modelo9Requester> {
  const c = await getCompanyInfo("sale");
  return { ...emptyRequester("empresa"), name: c.legalName, nif: c.nipc, certCode: c.certCode, address: c.address, postalCode: c.postalCode, city: c.city, email: c.email, phone: c.phone };
}

/** Os dados do requerente passam para a ficha do cliente (fica a "aprender" para o carro seguinte). */
function requesterToClient(r: Partial<Modelo9Requester>) {
  const nif = (r.nif ?? "").replace(/\D/g, "");
  return {
    kind: r.kind === "particular" ? ("particular" as const) : ("empresa" as const),
    name: (r.name ?? "").replace(/\s+/g, " ").trim(),
    nif: nif || null,
    docNumber: r.docNumber?.trim() || null,
    certCode: r.certCode?.trim() || null,
    address: r.address?.trim() || null,
    postalCode: r.postalCode?.trim() ? formatPostalCodePt(r.postalCode) : null,
    city: r.city?.trim() || null,
    email: r.email?.trim().toLowerCase() || null,
    phone: r.phone?.trim() || null,
  };
}

/** Encontra o cliente pelo NIF ou cria-o (requerente com nome e NIF válido). */
async function findOrCreateClient(r: Partial<Modelo9Requester>, userId: string): Promise<string | null> {
  const data = requesterToClient(r);
  if (!data.name || !data.nif || !isValidNif(data.nif)) return null;
  const [found] = await db.select({ id: schema.legalClients.id }).from(schema.legalClients).where(eq(schema.legalClients.nif, data.nif)).limit(1);
  if (found) return found.id;
  const id = newId("lcl");
  await db.insert(schema.legalClients).values({ id, ...data, createdBy: userId });
  return id;
}

/** Novo carro em legalização: do cliente escolhido (ou da empresa de vendas) e, se vier do stock, com os dados da viatura. */
export async function newLegalization(form: FormData): Promise<void> {
  const user = await assertPermission("forms.generate");
  const vehicleId = String(form.get("vehicleId") ?? "").trim() || null;
  const clientId = String(form.get("clientId") ?? "").trim() || null;
  const stageRaw = String(form.get("stage") ?? "modelo9");
  const stage: Stage = (STAGES as readonly string[]).includes(stageRaw) ? (stageRaw as Stage) : "modelo9";
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
  let requester = await companyRequester();
  if (clientId) {
    const [c] = await db.select().from(schema.legalClients).where(eq(schema.legalClients.id, clientId)).limit(1);
    if (!c) throw new UserError("Cliente não encontrado.");
    requester = clientToRequester({ ...c, nif: c.nif ?? "", docNumber: c.docNumber ?? "", certCode: c.certCode ?? "", address: c.address ?? "", postalCode: c.postalCode ?? "", city: c.city ?? "", email: c.email ?? "", phone: c.phone ?? "", notes: "" });
  }
  const id = newId("leg");
  await db.insert(schema.legalizations).values({
    id,
    vehicleId,
    clientId: clientId ?? (await findOrCreateClient(requester, user.id)),
    stage,
    requester: { ...requester },
    vehicle: { ...vehicle },
    createdBy: user.id,
  });
  await audit(user, { action: "legalization.create", entityType: "legalization", entityId: id, summary: `Abriu um processo de legalização (${STAGE_LABEL[stage]})` });
  revalidateLegalization(id, clientId);
  redirect(`/painel/legalizacao/${id}${stage === "modelo9" ? "" : `?etapa=${stage}`}`);
}

/** Guarda o que foi escrito (o editor grava sozinho, aos poucos). */
export async function saveLegalization(id: string, raw: LegalizationPatch): Promise<ActionResult<{ updatedAt: string; clientId: string | null }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const patch = patchSchema.parse(raw);
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const next: Partial<typeof schema.legalizations.$inferInsert> = { updatedAt: new Date() };
    if (patch.requester) next.requester = { ...row.requester, ...(patch.requester as Record<string, string>) };
    if (patch.vehicle) next.vehicle = { ...row.vehicle, ...(patch.vehicle as Record<string, string>) };
    if (patch.customs) next.customs = { ...row.customs, ...(patch.customs as Record<string, string>) };
    if (patch.registration) next.registration = { ...row.registration, ...(patch.registration as Record<string, string>) };
    if (patch.entryDate !== undefined) next.entryDate = patch.entryDate || null;
    if (patch.stage && patch.stage !== row.stage) {
      next.stage = patch.stage;
      await audit(user, { action: "legalization.stage", entityType: "legalization", entityId: id, summary: `Passou o carro para: ${STAGE_LABEL[patch.stage]}` });
    }
    if (patch.vehicleId !== undefined) {
      if (patch.vehicleId) {
        const [v] = await db.select({ id: schema.vehicles.id }).from(schema.vehicles).where(eq(schema.vehicles.id, patch.vehicleId)).limit(1);
        if (!v) throw new UserError("Viatura não encontrada.");
      }
      next.vehicleId = patch.vehicleId || null;
    }
    let clientId = row.clientId;
    if (patch.clientId !== undefined) {
      if (patch.clientId) {
        const [c] = await db.select({ id: schema.legalClients.id }).from(schema.legalClients).where(eq(schema.legalClients.id, patch.clientId)).limit(1);
        if (!c) throw new UserError("Cliente não encontrado.");
      }
      clientId = patch.clientId || null;
      next.clientId = clientId;
    }
    // A ficha do cliente aprende com o requerente; sem cliente, encontra-o (ou cria-o) pelo NIF.
    if (patch.requester) {
      const req = next.requester as Partial<Modelo9Requester>;
      if (clientId) {
        const data = requesterToClient(req);
        const nifOk = !data.nif || isValidNif(data.nif);
        const learn = Object.fromEntries(Object.entries(data).filter(([k, v]) => v !== null && v !== "" && (k !== "nif" || nifOk)));
        if (Object.keys(learn).length) {
          if (learn.nif) {
            const [dup] = await db.select({ id: schema.legalClients.id }).from(schema.legalClients).where(eq(schema.legalClients.nif, String(learn.nif))).limit(1);
            if (dup && dup.id !== clientId) delete learn.nif;
          }
          await db.update(schema.legalClients).set({ ...learn, updatedAt: new Date() }).where(eq(schema.legalClients.id, clientId));
        }
      } else {
        clientId = await findOrCreateClient(req, user.id);
        if (clientId) next.clientId = clientId;
      }
    }
    if (patch.status) next.status = patch.status;
    if (patch.notes !== undefined) next.notes = patch.notes || null;
    if (patch.addFileIds?.length) {
      const found = await db.select({ id: schema.files.id }).from(schema.files).where(inArray(schema.files.id, patch.addFileIds));
      next.fileIds = [...new Set([...row.fileIds, ...found.map((f) => f.id)])];
    }
    const [saved] = await db.update(schema.legalizations).set(next).where(eq(schema.legalizations.id, id)).returning({ updatedAt: schema.legalizations.updatedAt });
    if (next.stage || next.clientId !== undefined || next.registration || next.entryDate !== undefined) revalidateLegalization(id, clientId);
    return { updatedAt: saved.updatedAt.toISOString(), clientId };
  });
}

/** Documentos de um carro em legalização: liga ficheiros já carregados (fotografias, PDF, código QR). */
export async function addLegalizationDocuments(id: string, fileIds: string[], kind = "outro"): Promise<ActionResult<{ added: number }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    await assertPermission("documents.upload");
    const ids = z.array(z.string().max(60)).min(1).max(20).parse(fileIds);
    const k = kind in DOCUMENT_KINDS ? kind : "outro";
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const files = await db.select({ id: schema.files.id }).from(schema.files).where(inArray(schema.files.id, ids));
    const existing = await db
      .select({ fileId: schema.documents.fileId })
      .from(schema.documents)
      .where(and(eq(schema.documents.ownerType, "legalization"), eq(schema.documents.ownerId, id), inArray(schema.documents.fileId, ids)));
    const fresh = files.filter((f) => !existing.some((e) => e.fileId === f.id));
    if (fresh.length)
      await db.insert(schema.documents).values(
        fresh.map((f) => ({ id: newId("doc"), ownerType: "legalization" as const, ownerId: id, kind: k, label: DOCUMENT_KINDS[k as keyof typeof DOCUMENT_KINDS], fileId: f.id, uploadedBy: user.id })),
      );
    await db
      .update(schema.legalizations)
      .set({ fileIds: [...new Set([...row.fileIds, ...files.map((f) => f.id)])], updatedAt: new Date() })
      .where(eq(schema.legalizations.id, id));
    if (fresh.length) await audit(user, { action: "document.upload", entityType: "legalization", entityId: id, summary: `Guardou ${fresh.length} documento(s): ${DOCUMENT_KINDS[k as keyof typeof DOCUMENT_KINDS]}` });
    revalidateLegalization(id, row.clientId);
    return { added: fresh.length };
  });
}

async function legalizationDoc(docId: string) {
  const [d] = await db.select().from(schema.documents).where(and(eq(schema.documents.id, docId), eq(schema.documents.ownerType, "legalization"))).limit(1);
  if (!d) throw new UserError("Documento não encontrado.");
  return d;
}

export async function setLegalizationDocumentKind(docId: string, kind: string): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("forms.generate");
    const d = await legalizationDoc(docId);
    const k = kind in DOCUMENT_KINDS ? kind : "outro";
    await db.update(schema.documents).set({ kind: k, label: DOCUMENT_KINDS[k as keyof typeof DOCUMENT_KINDS] }).where(eq(schema.documents.id, docId));
    revalidatePath(`/painel/legalizacao/${d.ownerId}`);
  });
}

/** Apaga um documento do carro (ex.: fotografia errada ou de teste) e o ficheiro. */
export async function deleteLegalizationDocument(docId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const d = await legalizationDoc(docId);
    await db.delete(schema.documents).where(eq(schema.documents.id, docId));
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, d.ownerId)).limit(1);
    if (row) {
      const patch: Partial<typeof schema.legalizations.$inferInsert> = { fileIds: row.fileIds.filter((f) => f !== d.fileId) };
      if (row.modelo9FileId === d.fileId) patch.modelo9FileId = null;
      await db.update(schema.legalizations).set(patch).where(eq(schema.legalizations.id, row.id));
    }
    const [other] = await db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.fileId, d.fileId)).limit(1);
    if (!other) await removeFile(d.fileId).catch(() => undefined);
    await audit(user, { action: "document.delete", entityType: "legalization", entityId: d.ownerId, summary: `Apagou o documento "${d.label}"` });
    revalidateLegalization(d.ownerId, row?.clientId);
  }, "Documento apagado.");
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
    // Fica nos documentos do carro em legalização (e da viatura do stock, se houver).
    await db.insert(schema.documents).values({
      id: newId("doc"), ownerType: "legalization", ownerId: id, kind: "modelo9", label: DOCUMENT_KINDS.modelo9, fileId: stored.id, extractionStatus: "none", uploadedBy: user.id,
    });
    if (row.vehicleId)
      await db.insert(schema.documents).values({
        id: newId("doc"), ownerType: "vehicle", ownerId: row.vehicleId, kind: "modelo9", label: "Modelo 9 (IMT)", fileId: stored.id, extractionStatus: "none", uploadedBy: user.id,
      });
    await audit(user, {
      action: "legalization.modelo9",
      entityType: "legalization",
      entityId: id,
      summary: `Gerou o Modelo 9 de ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}${vehicle.foreignPlate ? ` (${vehicle.foreignPlate})` : ""} em nome de ${requester.name}`,
    });
    revalidateLegalization(id, row.clientId);
    if (row.vehicleId) revalidatePath(`/painel/viaturas/${row.vehicleId}`);
    return { url: `/api/admin/files/${stored.id}`, fileId: stored.id };
  }, "Modelo 9 gerado.");
}

/** Apaga o processo; os ficheiros continuam guardados (retenção). */
export async function deleteLegalization(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    await db.delete(schema.documents).where(and(eq(schema.documents.ownerType, "legalization"), eq(schema.documents.ownerId, id)));
    await db.delete(schema.legalizations).where(eq(schema.legalizations.id, id));
    await audit(user, { action: "legalization.delete", entityType: "legalization", entityId: id, summary: "Apagou um processo de legalização (os ficheiros ficam guardados)" });
    revalidateLegalization(id, row.clientId);
  }, "Processo apagado.");
}
