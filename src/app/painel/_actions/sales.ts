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
import { newId } from "@/server/ids";
import { getCompanyInfo, writeSetting } from "@/server/settings";
import { run, UserError } from "@/server/action";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.");

const baseSchema = z
  .object({
    mode: z.enum(["sale", "rent"]).default("sale"),
    customerId: z.string().min(1, "Escolha o cliente.").max(60),
    priceEur: z.number().min(0).max(100_000_000).nullable().default(null),
    date: isoDate,
    time: hhmm,
    deliveryKm: z.number().int().min(0).max(2_000_000).nullable(),
    place: z.string().trim().max(100),
    notes: z.string().trim().max(2000),
    documents: z.array(z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]])).max(5),
    warranty: z
      .object({
        months: z.number().int().min(0).max(120).nullable().optional(),
        number: z.string().trim().max(60).optional(),
        extras: z.string().trim().max(600).optional(),
      })
      .optional(),
    rental: z
      .object({
        startDate: isoDate,
        startTime: hhmm,
        endDate: isoDate,
        endTime: hhmm,
        kmOut: z.number().int().min(0).max(2_000_000).nullable().optional(),
        totalEur: z.number().min(0).max(10_000_000).nullable().optional(),
        paymentMethod: z.string().trim().max(400).optional(),
        condition: z.string().trim().max(600).optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "sale" && !v.priceEur) ctx.addIssue({ code: "custom", path: ["priceEur"], message: "Indique o preço de venda." });
    if (v.mode === "rent") {
      if (!v.rental) ctx.addIssue({ code: "custom", path: ["rental"], message: "Indique o prazo do aluguer." });
      else if (`${v.rental.endDate}T${v.rental.endTime}` <= `${v.rental.startDate}T${v.rental.startTime}`)
        ctx.addIssue({ code: "custom", path: ["rental"], message: "O fim do aluguer tem de ser depois do início." });
    }
  });

const dealSchema = baseSchema.and(
  z.object({
    markSold: z.boolean().default(false),
    /** Valores revistos no passo "Dados do contrato" (chave {{...}} → texto). */
    values: z.record(z.string().max(80), z.string().max(600)).default({}),
    saveToRecords: z.boolean().default(true),
  }),
);

export type ReviewInput = z.input<typeof baseSchema>;
export type SaleInput = z.input<typeof dealSchema>;

/** Campos que podem ficar vazios; todos os outros são obrigatórios para gerar. */
const OPTIONAL = new Set([
  "venda.observacoes", "cliente.email", "cliente.telefone", "garantia.complementos", "garantia.numero", "empresa.instagram",
  "viatura.versao", "empresa.representante", "empresa.cargo",
]);
const ORDER = PLACEHOLDERS.map((p) => p.key);
const LABEL = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.label]));
const groupOf = (key: string, mode: "sale" | "rent") =>
  ({
    empresa: mode === "rent" ? "Empresa (locador)" : "Empresa (vendedor)",
    cliente: mode === "rent" ? "Locatário" : "Comprador",
    viatura: "Viatura",
    venda: mode === "rent" ? "Contrato" : "Venda",
    garantia: "Garantia",
    aluguer: "Aluguer",
  })[key.split(".")[0]] ?? "Outros";

export type ContractField = { key: string; label: string; group: string; value: string; required: boolean; savesTo: string | null };

/** Onde cada campo é guardado quando a pessoa o completa (para não voltar a escrever). */
const savesTo = (key: string): string | null => {
  if (key.startsWith("empresa.")) return "dados da empresa";
  if (key.startsWith("cliente.") && key !== "cliente.documento") return "ficha do cliente";
  if (["viatura.marca", "viatura.modelo", "viatura.versao", "viatura.matricula", "viatura.vin", "viatura.primeira_matricula", "viatura.primeiro_registo", "viatura.cor", "viatura.cilindrada", "viatura.lugares"].includes(key))
    return "viatura";
  return null;
};

async function loadParties(vehicleId: string, customerId: string) {
  const [vehicle] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
  if (!vehicle) throw new UserError("Viatura não encontrada.");
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
  if (!customer) throw new UserError("Cliente não encontrado.", { customerId: "Escolha o cliente." });
  return { vehicle, customer };
}

function context(input: z.infer<typeof baseSchema>) {
  return {
    sale: { priceEur: input.priceEur, date: input.date, time: input.time, place: input.place, deliveryKm: input.deliveryKm, notes: input.notes },
    ctx: {
      mode: input.mode,
      warranty: input.warranty ? { months: input.warranty.months ?? 18, number: input.warranty.number, extras: input.warranty.extras, start: input.date, delivery: input.date } : undefined,
      rental: input.rental,
    },
  };
}

/**
 * Passo "Dados do contrato": todos os campos que os documentos escolhidos usam, já preenchidos com
 * o que o sistema sabe (empresa, cliente, viatura, venda/aluguer). Os vazios são completados antes de gerar.
 */
export async function reviewSale(vehicleId: string, raw: ReviewInput): Promise<ActionResult<{ fields: ContractField[] }>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const input = baseSchema.parse(raw);
    if (!input.documents.length) throw new UserError("Escolha pelo menos um documento.");
    const { vehicle, customer } = await loadParties(vehicleId, input.customerId);
    const { sale, ctx } = context(input);
    const values = await buildValues(customer, vehicle, sale, ctx);
    const keys = new Set<string>();
    for (const t of input.documents) for (const k of await templateFieldKeys(t)) keys.add(k);
    keys.delete("documento.referencia");
    const fields = [...keys]
      .sort((a, b) => (ORDER.indexOf(a) === -1 ? 999 : ORDER.indexOf(a)) - (ORDER.indexOf(b) === -1 ? 999 : ORDER.indexOf(b)))
      .map((key) => ({ key, label: LABEL[key] ?? key, group: groupOf(key, input.mode), value: values[key] ?? "", required: !OPTIONAL.has(key), savesTo: savesTo(key) }));
    return { fields };
  });
}

/** Guarda nas fichas o que foi completado no contrato (só o que estava vazio ou foi corrigido). */
async function saveBack(
  user: Awaited<ReturnType<typeof assertPermission>>,
  mode: "sale" | "rent",
  values: Record<string, string>,
  before: Record<string, string>,
  vehicle: typeof schema.vehicles.$inferSelect,
  customer: typeof schema.customers.$inferSelect,
): Promise<string[]> {
  const changed = (k: string) => values[k] !== undefined && values[k].trim() !== "" && values[k].trim() !== (before[k] ?? "").trim();
  const v = (k: string) => values[k].trim();
  const date = (k: string) => normalizeDate(values[k]) || null;
  const int = (k: string) => {
    const n = Number(values[k].replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const saved: string[] = [];

  if (can(user, "customers.edit")) {
    const patch: Partial<typeof schema.customers.$inferInsert> = {};
    if (changed("cliente.nome")) patch.fullName = v("cliente.nome");
    if (changed("cliente.nif")) {
      const nif = values["cliente.nif"].replace(/\D/g, "");
      if (!isValidNif(nif)) throw new UserError("O NIF do cliente não é válido.", { "cliente.nif": "NIF inválido." });
      patch.nif = nif;
    }
    if (changed("cliente.numero_documento")) patch.idDocumentNumber = v("cliente.numero_documento");
    if (changed("cliente.validade_documento")) patch.idDocumentExpiry = date("cliente.validade_documento");
    if (changed("cliente.nascimento")) patch.birthDate = date("cliente.nascimento");
    if (changed("cliente.telefone")) patch.phone = v("cliente.telefone");
    if (changed("cliente.email")) patch.email = v("cliente.email");
    if (changed("cliente.carta")) patch.drivingLicenseNumber = v("cliente.carta");
    if (changed("cliente.carta_emissao")) patch.drivingLicenseIssuedAt = date("cliente.carta_emissao");
    if (changed("cliente.nacionalidade")) patch.nationality = v("cliente.nacionalidade");
    if (changed("cliente.morada_rua")) patch.address = v("cliente.morada_rua");
    if (changed("cliente.codigo_postal")) patch.postalCode = v("cliente.codigo_postal");
    if (changed("cliente.localidade")) patch.city = v("cliente.localidade");
    // Campo composto: só se a ficha ainda não tinha morada.
    if (changed("cliente.morada") && !customer.address && !patch.address) patch.address = v("cliente.morada");
    if (Object.keys(patch).length) {
      await db.update(schema.customers).set({ ...patch, updatedAt: new Date() }).where(eq(schema.customers.id, customer.id));
      await audit(user, { action: "customer.update", entityType: "customer", entityId: customer.id, summary: `Completou a ficha de ${customer.fullName} ao preparar o documento`, changes: diff(customer, patch) });
      saved.push("ficha do cliente");
    }
  }

  if (can(user, "vehicles.edit")) {
    const patch: Partial<typeof schema.vehicles.$inferInsert> = {};
    if (changed("viatura.cor")) patch.color = v("viatura.cor");
    if (changed("viatura.primeira_matricula")) patch.firstRegistration = date("viatura.primeira_matricula");
    if (changed("viatura.primeiro_registo")) patch.firstRegistration = date("viatura.primeiro_registo");
    if (changed("viatura.matricula")) patch.plate = formatPlate(values["viatura.matricula"]);
    if (changed("viatura.vin")) patch.vin = normalizeVin(values["viatura.vin"]);
    if (changed("viatura.marca")) patch.make = v("viatura.marca");
    if (changed("viatura.modelo")) patch.model = v("viatura.modelo");
    if (changed("viatura.versao")) patch.version = v("viatura.versao");
    if (changed("viatura.cilindrada")) patch.engineCc = int("viatura.cilindrada");
    if (changed("viatura.lugares")) patch.seats = int("viatura.lugares");
    if (Object.keys(patch).length) {
      await db.update(schema.vehicles).set({ ...patch, updatedAt: new Date() }).where(eq(schema.vehicles.id, vehicle.id));
      await audit(user, { action: "vehicle.update", entityType: "vehicle", entityId: vehicle.id, summary: `Completou dados de ${vehicle.make} ${vehicle.model} ao preparar o documento`, changes: diff(vehicle, patch) });
      saved.push("viatura");
    }
  }

  if (can(user, "site.edit")) {
    const company = await getCompanyInfo(mode);
    const next = { ...company };
    if (changed("empresa.nome")) next.legalName = v("empresa.nome");
    if (changed("empresa.nipc")) {
      const nipc = values["empresa.nipc"].replace(/\D/g, "");
      if (!isValidNif(nipc)) throw new UserError("O NIF da empresa não é válido.", { "empresa.nipc": "NIF inválido." });
      next.nipc = nipc;
    }
    if (changed("empresa.telefone")) next.phone = v("empresa.telefone");
    if (changed("empresa.email")) next.email = v("empresa.email");
    if (changed("empresa.instagram")) next.instagram = v("empresa.instagram");
    if (changed("empresa.morada_rua")) next.address = v("empresa.morada_rua");
    if (changed("empresa.codigo_postal")) next.postalCode = v("empresa.codigo_postal");
    if (changed("empresa.localidade")) next.city = v("empresa.localidade");
    if (changed("empresa.representante")) next.representativeName = v("empresa.representante");
    if (changed("empresa.cargo")) next.representativeRole = v("empresa.cargo");
    if (changed("empresa.morada") && !company.address) next.address = v("empresa.morada");
    if (JSON.stringify(next) !== JSON.stringify(company)) {
      const key = mode === "sale" ? "company" : "company_rent";
      await writeSetting(key, next, user.id);
      await audit(user, { action: "settings.company", entityType: "settings", entityId: key, summary: "Completou os dados da empresa ao preparar um documento", changes: diff(company as unknown as Record<string, unknown>, next) });
      saved.push("dados da empresa");
    }
  }
  return saved;
}

/**
 * Venda: associa o comprador, marca como vendida e gera garantia + declaração de circulação.
 * Aluguer: regista o aluguer e gera o contrato de locação. Nunca gera com campos obrigatórios vazios.
 */
export async function completeSale(
  vehicleId: string,
  raw: SaleInput,
): Promise<ActionResult<{ documents: { title: string; url: string; format: "docx" | "pdf" }[]; saved: string[] }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const input = dealSchema.parse(raw);
    if (input.markSold || input.mode === "rent") await assertPermission("vehicles.status");
    const { vehicle, customer } = await loadParties(vehicleId, input.customerId);
    if (input.mode === "sale" && vehicle.status === "sold" && vehicle.buyerCustomerId && vehicle.buyerCustomerId !== customer.id && input.markSold)
      throw new UserError("Esta viatura já está vendida a outro cliente. Mude o estado primeiro se a venda foi anulada.");

    const { sale, ctx } = context(input);
    const before = await buildValues(customer, vehicle, sale, ctx);
    const final = { ...before };
    for (const [k, val] of Object.entries(input.values)) if (val.trim()) final[k] = val.trim();

    const keys = new Set<string>();
    for (const t of input.documents) for (const k of await templateFieldKeys(t)) keys.add(k);
    const missing = [...keys].filter((k) => k !== "documento.referencia" && !OPTIONAL.has(k) && !final[k]?.trim());
    if (missing.length)
      throw new UserError(`Preencha antes de gerar: ${missing.map((k) => LABEL[k] ?? k).join(", ")}.`, Object.fromEntries(missing.map((k) => [k, "Obrigatório."])));
    for (const k of keys) if (OPTIONAL.has(k) && !final[k]?.trim()) final[k] = "—";

    const saved = input.saveToRecords ? await saveBack(user, input.mode, input.values, before, vehicle, customer) : [];

    let current = vehicle;
    if (input.mode === "sale" && input.markSold) {
      const patch = {
        status: "sold" as const,
        soldAt: new Date(`${input.date}T12:00:00Z`),
        soldPriceEur: input.priceEur,
        buyerCustomerId: customer.id,
        ...(input.deliveryKm != null ? { mileageKm: input.deliveryKm } : {}),
        updatedAt: new Date(),
      };
      await db.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, vehicleId));
      await audit(user, { action: "vehicle.sale", entityType: "vehicle", entityId: vehicleId, summary: `Vendeu ${vehicle.make} ${vehicle.model}${vehicle.plate ? ` (${vehicle.plate})` : ""} a ${customer.fullName}`, changes: diff(vehicle, patch) });
      current = { ...vehicle, ...patch };
    }
    if (input.mode === "rent" && input.rental) {
      const r = input.rental;
      const rentalId = newId("rnt");
      await db.insert(schema.rentals).values({
        id: rentalId,
        vehicleId,
        customerId: customer.id,
        startAt: new Date(`${r.startDate}T${r.startTime}:00`),
        endAt: new Date(`${r.endDate}T${r.endTime}:00`),
        kmOut: r.kmOut ?? vehicle.mileageKm ?? null,
        totalEur: r.totalEur ?? null,
        paymentMethod: final["aluguer.forma_pagamento"] ?? null,
        notes: input.notes || null,
        createdBy: user.id,
      });
      await audit(user, {
        action: "vehicle.rent",
        entityType: "vehicle",
        entityId: vehicleId,
        summary: `Alugou ${vehicle.make} ${vehicle.model}${vehicle.plate ? ` (${vehicle.plate})` : ""} a ${customer.fullName} de ${r.startDate.split("-").reverse().join("/")} a ${r.endDate.split("-").reverse().join("/")}`,
      });
    }

    const documents: { title: string; url: string; format: "docx" | "pdf" }[] = [];
    for (const t of input.documents) {
      const doc = await createFormDocument(user, t, customer, current, sale, final, ctx);
      documents.push({ title: doc.title, url: doc.url, format: doc.format });
    }

    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath(`/painel/clientes/${customer.id}`);
    revalidatePath("/painel/viaturas");
    if (input.mode === "sale" && input.markSold && vehicle.published) revalidatePath("/", "layout");
    return { documents, saved };
  }, raw.mode === "rent" ? "Aluguer registado e contrato gerado." : "Venda registada e documentos gerados.");
}
