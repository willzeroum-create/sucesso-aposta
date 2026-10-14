"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { PLACEHOLDERS, TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { formatPlate, isValidNif, normalizeDate, normalizeVin } from "@/lib/pt-validation";
import { audit, diff } from "@/server/audit";
import { assertPermission, can } from "@/server/auth/session";
import { buildValues, createFormDocument, templateFieldKeys } from "@/server/forms";
import { getCompanyInfo, writeSetting } from "@/server/settings";
import { run, UserError } from "@/server/action";

const baseSchema = z.object({
  customerId: z.string().min(1, "Escolha o comprador.").max(60),
  priceEur: z.number({ error: "Indique o preço de venda." }).min(1, "Indique o preço de venda.").max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida."),
  deliveryKm: z.number().int().min(0).max(2_000_000).nullable(),
  place: z.string().trim().max(100),
  notes: z.string().trim().max(2000),
  documents: z.array(z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]])).max(5),
});

const saleSchema = baseSchema.extend({
  markSold: z.boolean(),
  /** Valores revistos no passo "Dados do contrato" (chave {{...}} → texto). */
  values: z.record(z.string().max(80), z.string().max(600)).default({}),
  saveToRecords: z.boolean().default(true),
});

export type ReviewInput = z.input<typeof baseSchema>;
export type SaleInput = z.input<typeof saleSchema>;

/** Campos que podem ficar vazios; todos os outros são obrigatórios para gerar. */
const OPTIONAL = new Set(["venda.observacoes", "cliente.email", "cliente.telefone"]);
const GROUP: Record<string, string> = { empresa: "Stand (vendedor)", cliente: "Comprador", viatura: "Viatura", venda: "Venda" };
const ORDER = PLACEHOLDERS.map((p) => p.key);
const LABEL = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.label]));

export type ContractField = { key: string; label: string; group: string; value: string; required: boolean; savesTo: string | null };

/** Onde cada campo é guardado quando a pessoa o completa (para não voltar a escrever). */
const SAVES_TO: Record<string, string> = {
  "empresa.nome": "dados do stand",
  "empresa.nipc": "dados do stand",
  "empresa.morada": "dados do stand",
  "empresa.representante": "dados do stand",
  "empresa.cargo": "dados do stand",
  "cliente.nome": "ficha do cliente",
  "cliente.nif": "ficha do cliente",
  "cliente.documento": "ficha do cliente",
  "cliente.validade_documento": "ficha do cliente",
  "cliente.morada": "ficha do cliente",
  "cliente.telefone": "ficha do cliente",
  "cliente.email": "ficha do cliente",
  "cliente.carta": "ficha do cliente",
  "cliente.nascimento": "ficha do cliente",
  "cliente.nacionalidade": "ficha do cliente",
  "viatura.marca": "viatura",
  "viatura.matricula": "viatura",
  "viatura.vin": "viatura",
  "viatura.primeira_matricula": "viatura",
  "viatura.cor": "viatura",
};

async function loadParties(vehicleId: string, customerId: string) {
  const [vehicle] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
  if (!vehicle) throw new UserError("Viatura não encontrada.");
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
  if (!customer) throw new UserError("Comprador não encontrado.", { customerId: "Escolha o comprador." });
  return { vehicle, customer };
}

/**
 * Passo "Dados do contrato": todos os campos que os documentos escolhidos usam, já preenchidos com
 * o que o sistema sabe (stand, comprador, viatura, venda). Os vazios são completados antes de gerar.
 */
export async function reviewSale(vehicleId: string, raw: ReviewInput): Promise<ActionResult<{ fields: ContractField[] }>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const input = baseSchema.parse(raw);
    if (!input.documents.length) throw new UserError("Escolha pelo menos um documento.");
    const { vehicle, customer } = await loadParties(vehicleId, input.customerId);
    const values = await buildValues(customer, vehicle, input);
    const keys = new Set<string>();
    for (const t of input.documents) for (const k of await templateFieldKeys(t)) keys.add(k);
    keys.delete("documento.referencia");
    const fields = [...keys]
      .sort((a, b) => (ORDER.indexOf(a) === -1 ? 999 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 999 : ORDER.indexOf(b)))
      .map((key) => ({
        key,
        label: LABEL[key] ?? key,
        group: GROUP[key.split(".")[0]] ?? "Outros",
        value: values[key] ?? "",
        required: !OPTIONAL.has(key),
        savesTo: SAVES_TO[key] ?? null,
      }));
    return { fields };
  });
}

/** Guarda nas fichas o que foi completado no contrato (só o que estava vazio ou foi corrigido). */
async function saveBack(
  user: Awaited<ReturnType<typeof assertPermission>>,
  values: Record<string, string>,
  before: Record<string, string>,
  vehicle: typeof schema.vehicles.$inferSelect,
  customer: typeof schema.customers.$inferSelect,
): Promise<string[]> {
  const changed = (k: string) => values[k] !== undefined && values[k].trim() !== "" && values[k].trim() !== (before[k] ?? "").trim();
  const date = (k: string) => normalizeDate(values[k]) || null;
  const saved: string[] = [];

  if (can(user, "customers.edit")) {
    const patch: Partial<typeof schema.customers.$inferInsert> = {};
    if (changed("cliente.nome")) patch.fullName = values["cliente.nome"].trim();
    if (changed("cliente.nif")) {
      const nif = values["cliente.nif"].replace(/\D/g, "");
      if (!isValidNif(nif)) throw new UserError("O NIF do comprador não é válido.", { "cliente.nif": "NIF inválido." });
      patch.nif = nif;
    }
    if (changed("cliente.validade_documento")) patch.idDocumentExpiry = date("cliente.validade_documento");
    if (changed("cliente.nascimento")) patch.birthDate = date("cliente.nascimento");
    if (changed("cliente.telefone")) patch.phone = values["cliente.telefone"].trim();
    if (changed("cliente.email")) patch.email = values["cliente.email"].trim();
    if (changed("cliente.carta")) patch.drivingLicenseNumber = values["cliente.carta"].trim();
    if (changed("cliente.nacionalidade")) patch.nationality = values["cliente.nacionalidade"].trim();
    // Campos compostos: só se a ficha ainda não os tinha.
    if (changed("cliente.morada") && !customer.address) patch.address = values["cliente.morada"].trim();
    if (changed("cliente.documento") && !customer.idDocumentNumber) patch.idDocumentNumber = values["cliente.documento"].trim();
    if (Object.keys(patch).length) {
      await db.update(schema.customers).set({ ...patch, updatedAt: new Date() }).where(eq(schema.customers.id, customer.id));
      await audit(user, { action: "customer.update", entityType: "customer", entityId: customer.id, summary: `Completou a ficha de ${customer.fullName} ao preparar o contrato`, changes: diff(customer, patch) });
      saved.push("ficha do cliente");
    }
  }

  if (can(user, "vehicles.edit")) {
    const patch: Partial<typeof schema.vehicles.$inferInsert> = {};
    if (changed("viatura.cor")) patch.color = values["viatura.cor"].trim();
    if (changed("viatura.primeira_matricula")) patch.firstRegistration = date("viatura.primeira_matricula");
    if (changed("viatura.matricula")) patch.plate = formatPlate(values["viatura.matricula"]);
    if (changed("viatura.vin")) patch.vin = normalizeVin(values["viatura.vin"]);
    if (changed("viatura.marca")) patch.make = values["viatura.marca"].trim();
    if (Object.keys(patch).length) {
      await db.update(schema.vehicles).set({ ...patch, updatedAt: new Date() }).where(eq(schema.vehicles.id, vehicle.id));
      await audit(user, { action: "vehicle.update", entityType: "vehicle", entityId: vehicle.id, summary: `Completou dados de ${vehicle.make} ${vehicle.model} ao preparar o contrato`, changes: diff(vehicle, patch) });
      saved.push("viatura");
    }
  }

  if (can(user, "site.edit")) {
    const company = await getCompanyInfo();
    const next = { ...company };
    if (changed("empresa.nome")) next.legalName = values["empresa.nome"].trim();
    if (changed("empresa.nipc")) {
      const nipc = values["empresa.nipc"].replace(/\D/g, "");
      if (!isValidNif(nipc)) throw new UserError("O NIPC do stand não é válido.", { "empresa.nipc": "NIPC inválido." });
      next.nipc = nipc;
    }
    if (changed("empresa.representante")) next.representativeName = values["empresa.representante"].trim();
    if (changed("empresa.cargo")) next.representativeRole = values["empresa.cargo"].trim();
    if (changed("empresa.morada") && !company.address) next.address = values["empresa.morada"].trim();
    if (JSON.stringify(next) !== JSON.stringify(company)) {
      await writeSetting("company", next, user.id);
      await audit(user, { action: "settings.company", entityType: "settings", entityId: "company", summary: "Completou os dados do stand ao preparar um contrato", changes: diff(company as unknown as Record<string, unknown>, next) });
      saved.push("dados do stand");
    }
  }
  return saved;
}

/**
 * Dá saída à viatura: associa o comprador, marca como vendida e gera os documentos com os dados
 * revistos no passo anterior. Não gera com campos obrigatórios vazios.
 */
export async function completeSale(
  vehicleId: string,
  raw: SaleInput,
): Promise<ActionResult<{ documents: { title: string; url: string; format: "docx" | "pdf" }[]; saved: string[] }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const input = saleSchema.parse(raw);
    if (input.markSold) await assertPermission("vehicles.status");
    const { vehicle, customer } = await loadParties(vehicleId, input.customerId);
    if (vehicle.status === "sold" && vehicle.buyerCustomerId && vehicle.buyerCustomerId !== customer.id && input.markSold)
      throw new UserError("Esta viatura já está vendida a outro cliente. Mude o estado primeiro se a venda foi anulada.");

    const sale = { priceEur: input.priceEur, date: input.date, time: input.time, place: input.place, deliveryKm: input.deliveryKm, notes: input.notes };
    const before = await buildValues(customer, vehicle, sale);
    const final = { ...before };
    for (const [k, v] of Object.entries(input.values)) if (v.trim()) final[k] = v.trim();

    // Nenhum documento sai com campos obrigatórios em branco.
    const keys = new Set<string>();
    for (const t of input.documents) for (const k of await templateFieldKeys(t)) keys.add(k);
    const missing = [...keys].filter((k) => k !== "documento.referencia" && !OPTIONAL.has(k) && !final[k]?.trim());
    if (missing.length)
      throw new UserError(
        `Preencha antes de gerar: ${missing.map((k) => LABEL[k] ?? k).join(", ")}.`,
        Object.fromEntries(missing.map((k) => [k, "Obrigatório."])),
      );

    // Opcionais vazios saem como "—" em vez de uma linha em branco.
    for (const k of keys) if (OPTIONAL.has(k) && !final[k]?.trim()) final[k] = "—";

    const saved = input.saveToRecords ? await saveBack(user, input.values, before, vehicle, customer) : [];

    let current = vehicle;
    if (input.markSold) {
      const patch = {
        status: "sold" as const,
        soldAt: new Date(`${input.date}T12:00:00Z`),
        soldPriceEur: input.priceEur,
        buyerCustomerId: customer.id,
        ...(input.deliveryKm != null ? { mileageKm: input.deliveryKm } : {}),
        updatedAt: new Date(),
      };
      await db.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, vehicleId));
      await audit(user, {
        action: "vehicle.sale",
        entityType: "vehicle",
        entityId: vehicleId,
        summary: `Vendeu ${vehicle.make} ${vehicle.model}${vehicle.plate ? ` (${vehicle.plate})` : ""} a ${customer.fullName}`,
        changes: diff(vehicle, patch),
      });
      current = { ...vehicle, ...patch };
    }

    const documents: { title: string; url: string; format: "docx" | "pdf" }[] = [];
    for (const t of input.documents) {
      const doc = await createFormDocument(user, t, customer, current, sale, final);
      documents.push({ title: doc.title, url: doc.url, format: doc.format });
    }

    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath(`/painel/clientes/${customer.id}`);
    revalidatePath("/painel/viaturas");
    if (input.markSold && vehicle.published) revalidatePath("/", "layout");
    return { documents, saved };
  }, "Venda registada e documentos gerados.");
}
