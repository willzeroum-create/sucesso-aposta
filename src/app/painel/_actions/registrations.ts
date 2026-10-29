"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { isValidNif } from "@/lib/pt-validation";
import {
  DOC_TYPE_LABEL,
  emptyParty,
  emptyRegistrationVehicle,
  parseEurosText,
  PARTY_FIELDS,
  REGISTRATION_STATUS,
  VEHICLE_FIELDS_RA,
  type RegistrationDoc,
  type RegistrationParty,
  type RegistrationVehicle,
} from "@/lib/registo";
import { generateDeclaration } from "./declarations";
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
const paymentSchema = z
  .object({
    sale: txt(20),
    down: txt(20),
    bank: txt(20),
    pending: txt(20),
    owed: z.enum(["", "sim", "nao"]),
    how: z.enum(["", "vista", "prestacoes"]),
    toCharges: z.enum(["", "sim", "nao"]),
    dueDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida."),
    notes: txt(4000),
  })
  .partial();
type StatusKey = keyof typeof REGISTRATION_STATUS;

const patchSchema = z.object({
  buyer: partySchema.optional(),
  seller: partySchema.optional(),
  vehicle: vehicleSchema.optional(),
  /** Fiador / 2.º titular (null = tirar). Não entra no requerimento. */
  guarantor: partySchema.nullable().optional(),
  payment: paymentSchema.optional(),
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
  const id = await insertRegistration(user, String(form.get("vehicleId") ?? "").trim() || null);
  revalidatePath("/painel/registo");
  redirect(`/painel/registo/${id}`);
}

/** Separador "Venda" da ficha do carro: começa a compra e venda deste carro sem sair da ficha. */
export async function startVehicleRegistration(vehicleId: string): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const id = await insertRegistration(user, vehicleId);
    revalidatePath("/painel/registo");
    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath(`/painel/estoque/${vehicleId}`);
    return { id };
  });
}

async function insertRegistration(user: Awaited<ReturnType<typeof assertPermission>>, vehicleId: string | null): Promise<string> {
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
  return id;
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
    if (patch.guarantor !== undefined) next.guarantor = patch.guarantor ? { ...(patch.guarantor as Record<string, string>) } : null;
    // O chargeId só muda quando se cria a venda a prestações (não vem do navegador).
    if (patch.payment) next.payment = { ...(row.payment ?? {}), ...(patch.payment as Record<string, string>) };
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

const jobsSchema = z
  .array(z.object({ input: z.record(z.string(), z.unknown()), reviewed: z.record(z.string().max(80), z.string().max(600)) }))
  .max(10);
const docsOptsSchema = z.object({ markSold: z.boolean().default(false), km: z.number().int().min(0).max(2_000_000).nullable().default(null) });

/** Ficha do comprador (pelo NIF) ou ficha nova com os dados do processo. */
async function buyerCustomer(p: RegistrationParty, userId: string): Promise<string> {
  const nif = p.nif.replace(/\D/g, "");
  if (nif) {
    const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.nif, nif)).limit(1);
    if (c) return c.id;
  }
  const id = newId("cus");
  const person = p.kind === "particular" && p.docNumber.trim();
  await db.insert(schema.customers).values({
    id,
    fullName: p.name.trim(),
    nif: nif || null,
    email: p.email.trim() || null,
    address: p.address.trim() || null,
    postalCode: p.postalCode.trim() || null,
    city: p.city.trim() || null,
    idDocumentType: person ? (p.docType === "outro" ? p.docTypeOther : DOC_TYPE_LABEL[p.docType]) : null,
    idDocumentNumber: person ? p.docNumber.trim() : null,
    idDocumentExpiry: person && /^\d{4}-\d{2}-\d{2}$/.test(p.docExpiry) ? p.docExpiry : null,
    source: "Compra e venda",
    createdBy: userId,
  });
  return id;
}

/**
 * "7. Declarações e documentos": gera os documentos revistos (o mesmo das Declarações, ligado à viatura e à
 * ficha do cliente com o mesmo NIF) e, se pedido, marca a viatura do stock como vendida ao comprador.
 */
export async function generateRegistrationDocs(id: string, rawJobs: unknown, rawOpts: unknown): Promise<ActionResult<{ docs: RegistrationDoc[] }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const jobs = jobsSchema.parse(rawJobs);
    const opts = docsOptsSchema.parse(rawOpts ?? {});
    const [row] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    if (!jobs.length && !opts.markSold) throw new UserError("Escolha pelo menos um documento.");

    if (opts.markSold) {
      await assertPermission("vehicles.status");
      if (!row.vehicleId) throw new UserError("Escolha a viatura do stock (parte 4) para a marcar como vendida.");
      const buyer = { ...emptyParty(), ...row.buyer } as RegistrationParty;
      if (!buyer.name.trim()) throw new UserError("Falta o nome do comprador para marcar a viatura como vendida.");
      const nif = buyer.nif.replace(/\D/g, "");
      if (nif && !isValidNif(nif)) throw new UserError("O NIF do comprador não é válido.");
      const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, row.vehicleId)).limit(1);
      if (!v) throw new UserError("Viatura não encontrada.");
      const customerId = await buyerCustomer(buyer, user.id);
      if (v.status === "sold" && v.buyerCustomerId && v.buyerCustomerId !== customerId)
        throw new UserError("Esta viatura já está vendida a outro cliente. Mude o estado primeiro se a venda foi anulada.");
      const price = parseEurosText(String(row.payment?.sale ?? ""));
      const patch = {
        status: "sold" as const,
        soldAt: new Date(`${row.contractDate || today()}T12:00:00Z`),
        soldPriceEur: Number.isFinite(price) && price > 0 ? price : v.soldPriceEur,
        buyerCustomerId: customerId,
        ...(opts.km != null ? { mileageKm: opts.km } : {}),
        updatedAt: new Date(),
      };
      await db.update(schema.vehicles).set(patch).where(eq(schema.vehicles.id, v.id));
      await audit(user, { action: "vehicle.sale", entityType: "vehicle", entityId: v.id, summary: `Vendeu ${v.make} ${v.model}${v.plate ? ` (${v.plate})` : ""} a ${buyer.name}` });
      revalidatePath("/painel/viaturas");
      revalidatePath(`/painel/clientes/${customerId}`);
      if (v.published) revalidatePath("/", "layout");
    }

    const docs: RegistrationDoc[] = [];
    try {
      for (const job of jobs) {
        const input = { ...job.input };
        // Liga o documento à ficha do cliente com o mesmo NIF, quando existe.
        const nif = String((input.customer as Record<string, unknown> | undefined)?.nif ?? "").replace(/\D/g, "");
        if (nif && !input.customerId) {
          const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.nif, nif)).limit(1);
          if (c) input.customerId = c.id;
        }
        const res = await generateDeclaration(input, job.reviewed);
        if (!res.ok) throw new UserError(res.error, res.fields);
        docs.push({ ...res.data, at: new Date().toISOString() });
      }
    } finally {
      // Os que já saíram ficam na lista, mesmo que um dos seguintes falhe.
      if (docs.length) {
        await db
          .update(schema.registrations)
          .set({ docs: [...docs, ...(row.docs ?? [])], updatedAt: new Date() })
          .where(eq(schema.registrations.id, id));
      }
      revalidatePath(`/painel/registo/${id}`);
      if (row.vehicleId) {
        revalidatePath(`/painel/viaturas/${row.vehicleId}`);
        revalidatePath(`/painel/estoque/${row.vehicleId}`);
      }
    }
    return { docs };
  }, "Pronto.");
}

export async function deleteRegistration(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    await db.delete(schema.registrations).where(eq(schema.registrations.id, id));
    await audit(user, { action: "registration.delete", entityType: "registration", entityId: id, summary: "Apagou um processo de compra e venda (os ficheiros ficam guardados)" });
    revalidatePath("/painel/registo");
  }, "Processo apagado.");
}
