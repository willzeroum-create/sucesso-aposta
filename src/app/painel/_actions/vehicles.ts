"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { formatPlate, isValidVinFormat, normalizeVin } from "@/lib/pt-validation";
import { audit, diff } from "@/server/audit";
import { assertPermission, can } from "@/server/auth/session";
import { newId, slugify } from "@/server/ids";
import { publicationGaps } from "@/server/public-catalog";
import { removeFile } from "@/server/storage";
import { lookupDutchPlate, lookupVin, type VinLookupResult, type VinFields } from "@/server/vin";
import { optDate, optInt, optMoney, optText, reqText, run, UserError } from "@/server/action";

const STATUS_LABEL: Record<string, string> = { preparation: "Em preparação", available: "Disponível", reserved: "Reservado", sold: "Vendido" };

const vehicleSchema = z.object({
  make: reqText("a marca", 100),
  model: reqText("o modelo", 100),
  version: optText(160).transform((v) => v ?? ""),
  category: z.enum(["coupe", "saloon", "suv", "estate"], { error: "Escolha a carroçaria." }),
  year: optInt(1900, new Date().getUTCFullYear() + 1),
  mileageKm: optInt(0, 2_000_000),
  fuel: z.preprocess((v) => v || null, z.enum(["petrol", "diesel", "hybrid", "electric"]).nullable()),
  transmission: z.preprocess((v) => v || null, z.enum(["automatic", "manual"]).nullable()),
  powerHp: optInt(1, 5000),
  priceEur: optMoney(),
  highlight: optText(120),
  description: optText(4000),
  plate: optText(20).transform((v) => (v ? formatPlate(v) : null)),
  vin: optText(30).transform((v) => (v ? normalizeVin(v) : null)),
  color: optText(60),
  engineCc: optInt(1, 20_000),
  doors: optInt(1, 9),
  seats: optInt(1, 99),
  firstRegistration: optDate(),
  registrationDate: optDate(),
  registrationOwner: optText(200),
  vehicleType: optText(120),
  homologation: optText(120),
  grossWeightKg: optInt(1, 100_000),
  tareKg: optInt(1, 100_000),
  co2: optInt(0, 2000),
  nextInspection: optDate(),
  purchasePriceEur: optMoney(),
  purchaseDate: optDate(),
  supplier: optText(200),
  internalNotes: optText(4000),
});

const COST_FIELDS = ["purchasePriceEur", "purchaseDate", "supplier"] as const;

function fromForm(form: FormData) {
  return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
}

async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = slugify(base) || "viatura";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await db
      .select({ id: schema.vehicles.id })
      .from(schema.vehicles)
      .where(exceptId ? and(eq(schema.vehicles.slug, candidate), ne(schema.vehicles.id, exceptId)) : eq(schema.vehicles.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function assertNoDuplicate(vin: string | null, plate: string | null, exceptId?: string) {
  if (vin) {
    const [dup] = await db.select({ id: schema.vehicles.id, make: schema.vehicles.make, model: schema.vehicles.model }).from(schema.vehicles).where(eq(schema.vehicles.vin, vin)).limit(1);
    if (dup && dup.id !== exceptId) throw new UserError(`Já existe uma viatura com este VIN (${dup.make} ${dup.model}).`, { vin: "VIN já registado." });
  }
  if (plate) {
    const [dup] = await db.select({ id: schema.vehicles.id, make: schema.vehicles.make, model: schema.vehicles.model }).from(schema.vehicles).where(eq(schema.vehicles.plate, plate)).limit(1);
    if (dup && dup.id !== exceptId) throw new UserError(`Já existe uma viatura com esta matrícula (${dup.make} ${dup.model}).`, { plate: "Matrícula já registada." });
  }
}

/** Cria a viatura (sempre "Em preparação" e não publicada) e anexa documentos já carregados. */
export async function createVehicle(form: FormData, attachFileIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    const data = vehicleSchema.parse(fromForm(form));
    if (!can(user, "vehicles.costs")) for (const k of COST_FIELDS) data[k] = null;
    await assertNoDuplicate(data.vin, data.plate);
    const id = newId("veh");
    const slug = await uniqueSlug(`${data.make} ${data.model} ${data.version}`);
    await db.insert(schema.vehicles).values({ id, slug, ...data, status: "preparation", published: false, createdBy: user.id });

    const files = attachFileIds.length
      ? await db.select().from(schema.files).where(and(inArray(schema.files.id, attachFileIds.slice(0, 20)), eq(schema.files.uploadedBy, user.id), eq(schema.files.visibility, "private")))
      : [];
    for (const f of files) {
      await db.insert(schema.documents).values({
        id: newId("doc"),
        ownerType: "vehicle",
        ownerId: id,
        kind: f.mime === "application/pdf" ? "documento" : "documento",
        label: f.originalName,
        fileId: f.id,
        extractionStatus: "applied",
        uploadedBy: user.id,
      });
    }
    await audit(user, { action: "vehicle.create", entityType: "vehicle", entityId: id, summary: `Deu entrada da viatura ${data.make} ${data.model}${data.plate ? ` (${data.plate})` : ""}` });
    revalidatePath("/painel/viaturas");
    return { id };
  }, "Viatura criada.");
}

export async function updateVehicle(id: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    const [before] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
    if (!before) throw new UserError("Viatura não encontrada.");
    const data = vehicleSchema.parse(fromForm(form));
    if (!can(user, "vehicles.costs")) for (const k of COST_FIELDS) (data as Record<string, unknown>)[k] = before[k];
    await assertNoDuplicate(data.vin, data.plate, id);
    const slugChanged = before.make !== data.make || before.model !== data.model || before.version !== data.version;
    const slug = slugChanged && !before.published ? await uniqueSlug(`${data.make} ${data.model} ${data.version}`, id) : before.slug;

    // Uma viatura publicada não pode ficar incompleta no site.
    if (before.published) {
      const photos = await db.select({ id: schema.vehiclePhotos.id }).from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, id)).limit(1);
      const gaps = publicationGaps(data, photos.length > 0);
      if (gaps.length) throw new UserError(`Esta viatura está publicada no site. Preencha: ${gaps.join(", ")} — ou retire-a do site primeiro.`);
    }
    const changes = diff(before, { ...data, slug });
    if (!Object.keys(changes).length) return;
    await db.update(schema.vehicles).set({ ...data, slug, updatedAt: new Date() }).where(eq(schema.vehicles.id, id));
    await audit(user, { action: "vehicle.update", entityType: "vehicle", entityId: id, summary: `Editou ${data.make} ${data.model}`, changes: can(user, "vehicles.costs") ? changes : Object.fromEntries(Object.entries(changes).filter(([k]) => !COST_FIELDS.includes(k as never))) });
    revalidatePath(`/painel/viaturas/${id}`);
    revalidatePath("/painel/viaturas");
    if (before.published) revalidatePath("/", "layout");
  }, "Alterações guardadas.");
}

const statusSchema = z.object({
  status: z.enum(["preparation", "available", "reserved", "sold"]),
  published: z.boolean(),
  buyerCustomerId: z.string().max(60).nullable().optional(),
  soldPriceEur: z.number().min(0).max(100_000_000).nullable().optional(),
  soldAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** Estado comercial e publicação no site — a alteração reflete-se imediatamente no catálogo público. */
export async function setVehicleStatus(id: string, input: z.input<typeof statusSchema>): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.status");
    const data = statusSchema.parse(input);
    const [before] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
    if (!before) throw new UserError("Viatura não encontrada.");
    const published = data.status === "preparation" ? false : data.published;
    if (published) {
      const photos = await db.select({ id: schema.vehiclePhotos.id }).from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, id)).limit(1);
      const gaps = publicationGaps(before, photos.length > 0);
      if (gaps.length) throw new UserError(`Para publicar no site falta: ${gaps.join(", ")}.`);
    }
    if (data.buyerCustomerId) {
      const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, data.buyerCustomerId)).limit(1);
      if (!c) throw new UserError("Cliente não encontrado.");
    }
    const patch: Partial<typeof schema.vehicles.$inferInsert> = { status: data.status, published, updatedAt: new Date() };
    if (data.status === "sold") {
      patch.soldAt = data.soldAt ? new Date(`${data.soldAt}T12:00:00Z`) : before.soldAt ?? new Date();
      patch.soldPriceEur = data.soldPriceEur ?? before.soldPriceEur ?? before.priceEur;
      patch.buyerCustomerId = data.buyerCustomerId ?? before.buyerCustomerId;
    } else if (data.status === "reserved") {
      patch.buyerCustomerId = data.buyerCustomerId ?? before.buyerCustomerId;
      patch.soldAt = null;
    } else {
      patch.soldAt = null;
      patch.soldPriceEur = null;
      patch.buyerCustomerId = null;
    }
    const changes = diff(before, patch as Record<string, unknown>);
    if (!Object.keys(changes).length) return;
    await db.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, id));
    const parts = [];
    if (before.status !== data.status) parts.push(`${STATUS_LABEL[before.status]} → ${STATUS_LABEL[data.status]}`);
    if (before.published !== published) parts.push(published ? "publicada no site" : "retirada do site");
    await audit(user, { action: "vehicle.status", entityType: "vehicle", entityId: id, summary: `${before.make} ${before.model}: ${parts.join(", ") || "dados de venda atualizados"}`, changes });
    revalidatePath(`/painel/viaturas/${id}`);
    revalidatePath("/painel/viaturas");
    revalidatePath("/", "layout");
  }, "Estado atualizado.");
}

export async function deleteVehicle(id: string, confirmText: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.delete");
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    if (confirmText.trim().toUpperCase() !== "APAGAR") throw new UserError('Escreva "APAGAR" para confirmar.');
    if (v.status === "sold") throw new UserError("Viaturas vendidas não podem ser apagadas: ficam no histórico.");
    const photos = await db.select().from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, id));
    const docs = await db.select().from(schema.documents).where(and(eq(schema.documents.ownerType, "vehicle"), eq(schema.documents.ownerId, id)));
    await db.delete(schema.heroSlides).where(eq(schema.heroSlides.vehicleId, id));
    await db.delete(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, id));
    await db.delete(schema.documents).where(and(eq(schema.documents.ownerType, "vehicle"), eq(schema.documents.ownerId, id)));
    await db.delete(schema.vehicles).where(eq(schema.vehicles.id, id));
    for (const f of [...photos.map((p) => p.fileId), ...docs.map((d) => d.fileId)]) await removeFile(f);
    await audit(user, { action: "vehicle.delete", entityType: "vehicle", entityId: id, summary: `Apagou a viatura ${v.make} ${v.model}${v.plate ? ` (${v.plate})` : ""} com ${photos.length} fotografias e ${docs.length} documentos` });
    revalidatePath("/painel/viaturas");
    revalidatePath("/", "layout");
  }, "Viatura apagada.");
}

/* ── Fotografias ── */

export async function reorderPhotos(vehicleId: string, orderedIds: string[]): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    const photos = await db.select().from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, vehicleId));
    const known = new Set(photos.map((p) => p.id));
    const order = orderedIds.filter((id) => known.has(id));
    for (const [i, id] of order.entries()) await db.update(schema.vehiclePhotos).set({ position: i }).where(eq(schema.vehiclePhotos.id, id));
    await audit(user, { action: "vehicle.photos_reorder", entityType: "vehicle", entityId: vehicleId, summary: "Reordenou as fotografias" });
    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath("/", "layout");
  });
}

export async function setCoverPhoto(vehicleId: string, photoId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    const [p] = await db.select().from(schema.vehiclePhotos).where(and(eq(schema.vehiclePhotos.id, photoId), eq(schema.vehiclePhotos.vehicleId, vehicleId))).limit(1);
    if (!p) throw new UserError("Fotografia não encontrada.");
    await db.update(schema.vehicles).set({ coverPhotoId: photoId, updatedAt: new Date() }).where(eq(schema.vehicles.id, vehicleId));
    await audit(user, { action: "vehicle.cover", entityType: "vehicle", entityId: vehicleId, summary: "Escolheu a fotografia de capa" });
    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath("/", "layout");
  }, "Capa atualizada.");
}

export async function updatePhotoAlt(vehicleId: string, photoId: string, alt: string): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("vehicles.edit");
    await db.update(schema.vehiclePhotos).set({ alt: alt.trim().slice(0, 300) }).where(and(eq(schema.vehiclePhotos.id, photoId), eq(schema.vehiclePhotos.vehicleId, vehicleId)));
    revalidatePath(`/painel/viaturas/${vehicleId}`);
  });
}

export async function deletePhoto(vehicleId: string, photoId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    const [p] = await db.select().from(schema.vehiclePhotos).where(and(eq(schema.vehiclePhotos.id, photoId), eq(schema.vehiclePhotos.vehicleId, vehicleId))).limit(1);
    if (!p) throw new UserError("Fotografia não encontrada.");
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
    const remaining = await db.select({ id: schema.vehiclePhotos.id }).from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, vehicleId));
    if (v?.published && remaining.length <= 1) throw new UserError("É a única fotografia de uma viatura publicada. Carregue outra antes de a apagar.");
    const usedInHero = await db.select({ id: schema.heroSlides.id }).from(schema.heroSlides).where(eq(schema.heroSlides.vehicleId, vehicleId));
    const [file] = await db.select().from(schema.files).where(eq(schema.files.id, p.fileId)).limit(1);
    if (file && usedInHero.length) {
      const url = `/media/${file.storageKey.replace(/^public\//, "")}`;
      const heroes = await db.select().from(schema.heroSlides).where(eq(schema.heroSlides.vehicleId, vehicleId));
      if (heroes.some((h) => h.imageDesktop === url || h.imageMobile === url)) throw new UserError("Esta fotografia é usada numa capa do site. Troque a imagem da capa primeiro.");
    }
    await db.delete(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.id, photoId));
    if (v?.coverPhotoId === photoId) await db.update(schema.vehicles).set({ coverPhotoId: null }).where(eq(schema.vehicles.id, vehicleId));
    await removeFile(p.fileId);
    await audit(user, { action: "vehicle.photo_delete", entityType: "vehicle", entityId: vehicleId, summary: "Apagou uma fotografia" });
    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath("/", "layout");
  }, "Fotografia apagada.");
}

/* ── Pesquisa por VIN / matrícula NL ── */

export async function lookupVinAction(vin: string): Promise<ActionResult<VinLookupResult>> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    if (!isValidVinFormat(vin)) throw new UserError("O VIN tem de ter 17 caracteres (letras e números, sem I, O ou Q).", { vin: "VIN inválido." });
    const result = await lookupVin(vin);
    await audit(user, { action: "vehicle.vin_lookup", entityType: "vin", entityId: result.vin, summary: `Pesquisou o VIN ${result.vin} (${result.sources.filter((s) => s.ok).map((s) => s.name).join(", ") || "sem resultados externos"})` });
    return result;
  });
}

export async function lookupDutchPlateAction(plate: string): Promise<ActionResult<VinFields>> {
  return run(async () => {
    await assertPermission("vehicles.edit");
    const r = await lookupDutchPlate(plate);
    if (!r.ok) throw new UserError(r.message ?? "Sem resultados.");
    return r.fields;
  });
}
