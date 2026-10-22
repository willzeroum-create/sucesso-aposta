"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { FIELD_LABEL, OPTIONAL_FIELDS, fieldGroup, normalizeValues, sortFieldKeys, type ContractField } from "@/lib/contract-fields";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { isValidNif } from "@/lib/pt-validation";
import { assertPermission } from "@/server/auth/session";
import { buildValues, createFormDocument, getTemplates, templateFieldKeys, type DocContext, type SaleInput } from "@/server/forms";
import { run, UserError } from "@/server/action";

/**
 * Página Declarações: qualquer documento preenchido avulso, sem passar pela venda da viatura.
 * Cliente e viatura podem vir de fichas registadas ou só das fotos/escrita; nada é gravado nas fichas.
 */

const txt = (max: number) => z.string().trim().max(max).optional().default("");
const optIso = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.")
  .optional()
  .default("");
const optNumber = (max: number) => z.number().min(0).max(max).nullable().optional().default(null);

const inputSchema = z.object({
  template: z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]),
  customerId: z.string().max(60).nullable().optional(),
  vehicleId: z.string().max(60).nullable().optional(),
  customer: z.object({
    fullName: txt(160), nif: txt(20), idDocumentType: txt(60), idDocumentNumber: txt(60), idDocumentExpiry: optIso, birthDate: optIso,
    nationality: txt(60), drivingLicenseNumber: txt(60), drivingLicenseIssuedAt: optIso, address: txt(300), postalCode: txt(20),
    city: txt(100), country: txt(60), phone: txt(30), email: txt(254),
  }),
  vehicle: z.object({
    make: txt(60), model: txt(80), version: txt(120), plate: txt(20), vin: txt(30), firstRegistration: optIso, year: optNumber(2100),
    mileageKm: optNumber(2_000_000), color: txt(40), fuel: z.enum(["petrol", "diesel", "hybrid", "electric", ""]).optional().default(""),
    transmission: z.enum(["automatic", "manual", ""]).optional().default(""), engineCc: optNumber(20_000), powerHp: optNumber(3000), seats: optNumber(100),
  }),
  deal: z.object({
    priceEur: optNumber(100_000_000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")).default(""),
    place: txt(100),
    notes: txt(2000),
    warrantyMonths: optNumber(120),
    warrantyNumber: txt(60),
    warrantyExtras: txt(600),
    iban: txt(40),
    rental: z
      .object({ startDate: optIso, startTime: txt(5), endDate: optIso, endTime: txt(5), totalEur: optNumber(10_000_000), paymentMethod: txt(400) })
      .optional(),
  }),
});

type Input = z.infer<typeof inputSchema>;
type CustomerRow = typeof schema.customers.$inferSelect;
type VehicleRow = typeof schema.vehicles.$inferSelect;

const nullIfEmpty = (v: string) => v.trim() || null;

/** Cliente e viatura como as fichas os teriam (registados com o que foi escrito por cima, ou só o escrito). */
async function parties(input: Input) {
  const c = input.customer;
  const registeredCustomer = input.customerId ? (await db.select().from(schema.customers).where(eq(schema.customers.id, input.customerId)).limit(1))[0] ?? null : null;
  const customer = {
    ...(registeredCustomer ?? {}),
    fullName: c.fullName,
    nif: nullIfEmpty(c.nif.replace(/\D/g, "")),
    idDocumentType: nullIfEmpty(c.idDocumentType),
    idDocumentNumber: nullIfEmpty(c.idDocumentNumber),
    idDocumentExpiry: nullIfEmpty(c.idDocumentExpiry),
    birthDate: nullIfEmpty(c.birthDate),
    nationality: nullIfEmpty(c.nationality),
    drivingLicenseNumber: nullIfEmpty(c.drivingLicenseNumber),
    drivingLicenseIssuedAt: nullIfEmpty(c.drivingLicenseIssuedAt),
    address: nullIfEmpty(c.address),
    postalCode: nullIfEmpty(c.postalCode),
    city: nullIfEmpty(c.city),
    country: nullIfEmpty(c.country),
    phone: nullIfEmpty(c.phone),
    email: nullIfEmpty(c.email),
  } as CustomerRow;
  const v = input.vehicle;
  const registeredVehicle = input.vehicleId ? (await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, input.vehicleId)).limit(1))[0] ?? null : null;
  const vehicle = {
    ...(registeredVehicle ?? {}),
    make: v.make,
    model: v.model,
    version: v.version,
    plate: nullIfEmpty(v.plate),
    vin: nullIfEmpty(v.vin),
    firstRegistration: nullIfEmpty(v.firstRegistration),
    year: v.year,
    mileageKm: v.mileageKm,
    color: nullIfEmpty(v.color),
    fuel: v.fuel || null,
    transmission: v.transmission || null,
    engineCc: v.engineCc,
    powerHp: v.powerHp,
    seats: v.seats,
  } as VehicleRow;
  return { customer, vehicle, registeredCustomer, registeredVehicle };
}

function context(input: Input, mode: "sale" | "rent"): { sale: SaleInput; ctx: DocContext } {
  const d = input.deal;
  return {
    sale: { priceEur: d.priceEur, date: d.date, time: d.time, place: d.place, deliveryKm: null, notes: d.notes },
    ctx: {
      mode,
      warranty: { months: d.warrantyMonths ?? 18, number: d.warrantyNumber, extras: d.warrantyExtras, start: d.date, delivery: d.date },
      rental: d.rental ? { ...d.rental, kmOut: input.vehicle.mileageKm } : undefined,
      // No Contrato de consignação, a viatura do formulário é a do cliente e o preço é o mínimo de venda.
      consignment: {
        make: input.vehicle.make, model: input.vehicle.model, plate: input.vehicle.plate, year: input.vehicle.year, vin: input.vehicle.vin,
        km: input.vehicle.mileageKm, minPriceEur: d.priceEur, iban: d.iban,
      },
    },
  };
}

async function prepare(raw: unknown) {
  const input = inputSchema.parse(raw);
  const template = (await getTemplates())[input.template];
  const mode = template.mode === "rent" ? "rent" : "sale";
  const p = await parties(input);
  const { sale, ctx } = context(input, mode);
  const values = await buildValues(p.customer, p.vehicle, sale, ctx);
  const keys = (await templateFieldKeys(input.template)).filter((k) => k !== "documento.referencia");
  return { input, template, mode, ...p, sale, ctx, values, keys } as const;
}

/** Dados da viatura registada, para preencher o formulário. */
export async function declarationVehicle(id: string): Promise<ActionResult<Record<string, string>>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    const s = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));
    return {
      make: v.make, model: v.model, version: v.version, plate: s(v.plate), vin: s(v.vin), firstRegistration: s(v.firstRegistration), year: s(v.year),
      mileageKm: s(v.mileageKm), color: s(v.color), fuel: s(v.fuel), transmission: s(v.transmission), engineCc: s(v.engineCc), powerHp: s(v.powerHp), seats: s(v.seats),
    };
  });
}

/** Passo de revisão: todos os campos do documento, já preenchidos. */
export async function reviewDeclaration(raw: unknown): Promise<ActionResult<{ fields: ContractField[] }>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const { values, keys, mode } = await prepare(raw);
    return {
      fields: sortFieldKeys(keys).map((key) => ({ key, label: FIELD_LABEL[key] ?? key, group: fieldGroup(key, mode), value: values[key] ?? "", required: !OPTIONAL_FIELDS.has(key), savesTo: null })),
    };
  });
}

/** Gera o documento com os dados revistos. Nunca sai com campos obrigatórios vazios. */
export async function generateDeclaration(
  raw: unknown,
  reviewed: Record<string, string>,
): Promise<ActionResult<{ title: string; url: string; format: "docx" | "pdf" }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const edits = z.record(z.string().max(80), z.string().max(600)).parse(reviewed);
    const { input, values, keys, registeredCustomer, registeredVehicle, sale, ctx } = await prepare(raw);
    let final = { ...values };
    for (const [k, v] of Object.entries(edits)) if (keys.includes(k)) final[k] = v.trim();
    final = normalizeValues(final);
    const missing = keys.filter((k) => !OPTIONAL_FIELDS.has(k) && !final[k]?.trim());
    if (missing.length)
      throw new UserError(`Preencha antes de gerar: ${missing.map((k) => FIELD_LABEL[k] ?? k).join(", ")}.`, Object.fromEntries(missing.map((k) => [k, "Obrigatório."])));
    const nif = final["cliente.nif"]?.replace(/\D/g, "");
    if (keys.includes("cliente.nif") && nif && !isValidNif(nif)) throw new UserError("O NIF do cliente não é válido.", { "cliente.nif": "NIF inválido." });
    for (const k of keys) if (OPTIONAL_FIELDS.has(k) && !final[k]?.trim()) final[k] = "—";

    // Liga o documento às fichas só quando foram escolhidas; o texto é sempre o que foi revisto.
    const doc = await createFormDocument(user, input.template, registeredCustomer, registeredVehicle, sale, final, ctx);
    revalidatePath("/painel/declaracoes");
    if (registeredCustomer) revalidatePath(`/painel/clientes/${registeredCustomer.id}`);
    if (registeredVehicle) {
      revalidatePath(`/painel/viaturas/${registeredVehicle.id}`);
      revalidatePath(`/painel/estoque/${registeredVehicle.id}`);
    }
    return { title: doc.title, url: doc.url, format: doc.format };
  }, "Documento gerado.");
}
