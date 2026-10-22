"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { formatPostalCodePt, isValidNif } from "@/lib/pt-validation";
import { audit, diff } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { removeFile } from "@/server/storage";
import { optDate, optText, reqText, run, UserError } from "@/server/action";

const customerSchema = z
  .object({
    fullName: reqText("o nome", 160),
    email: optText(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
    phone: optText(30).refine((v) => !v || /^[+\d\s().-]{7,30}$/.test(v), "Telefone inválido."),
    nif: optText(20).transform((v) => (v ? v.replace(/\D/g, "") : null)),
    idDocumentType: optText(60),
    idDocumentNumber: optText(60),
    idDocumentExpiry: optDate(),
    idDocumentIssuer: optText(100),
    birthDate: optDate(),
    nationality: optText(60),
    address: optText(300),
    postalCode: optText(20).transform((v) => (v ? formatPostalCodePt(v) : null)),
    city: optText(100),
    country: optText(60),
    drivingLicenseNumber: optText(60),
    drivingLicenseIssuedAt: optDate(),
    notes: optText(4000),
    source: optText(60),
  })
  .superRefine((v, ctx) => {
    if (v.nif && !isValidNif(v.nif)) ctx.addIssue({ code: "custom", path: ["nif"], message: "NIF inválido (dígito de controlo)." });
  });

const fromForm = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));

async function assertNoDuplicateNif(nif: string | null, exceptId?: string) {
  if (!nif) return;
  const [dup] = await db.select({ id: schema.customers.id, name: schema.customers.fullName }).from(schema.customers).where(eq(schema.customers.nif, nif)).limit(1);
  if (dup && dup.id !== exceptId) throw new UserError(`Já existe um cliente com este NIF: ${dup.name}.`, { nif: "NIF já registado." });
}

export async function createCustomer(form: FormData, attachFileIds: string[] = []): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("customers.edit");
    const data = customerSchema.parse(fromForm(form));
    await assertNoDuplicateNif(data.nif);
    const id = newId("cus");
    await db.insert(schema.customers).values({ id, ...data, createdBy: user.id });
    const files = attachFileIds.length
      ? await db.select().from(schema.files).where(and(inArray(schema.files.id, attachFileIds.slice(0, 10)), eq(schema.files.uploadedBy, user.id), eq(schema.files.visibility, "private")))
      : [];
    for (const f of files)
      await db.insert(schema.documents).values({ id: newId("doc"), ownerType: "customer", ownerId: id, kind: "identificacao", label: "Documento de identificação", fileId: f.id, extractionStatus: "applied", uploadedBy: user.id });
    await audit(user, { action: "customer.create", entityType: "customer", entityId: id, summary: `Criou a ficha de cliente ${data.fullName}` });
    revalidatePath("/painel/clientes");
    return { id };
  }, "Cliente criado.");
}

export async function updateCustomer(id: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers.edit");
    const [before] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    if (!before) throw new UserError("Cliente não encontrado.");
    const data = customerSchema.parse(fromForm(form));
    await assertNoDuplicateNif(data.nif, id);
    const changes = diff(before, data);
    if (!Object.keys(changes).length) return;
    await db.update(schema.customers).set({ ...data, updatedAt: new Date() }).where(eq(schema.customers.id, id));
    await audit(user, { action: "customer.update", entityType: "customer", entityId: id, summary: `Editou a ficha de ${data.fullName}`, changes });
    revalidatePath(`/painel/clientes/${id}`);
    revalidatePath("/painel/clientes");
  }, "Ficha atualizada.");
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("customers.edit");
    const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
    if (!c) throw new UserError("Cliente não encontrado.");
    // Vendas a prestações são dinheiro em dívida: apagam-se primeiro nas Cobranças, de propósito.
    const charges = await db.select({ id: schema.chargeContracts.id }).from(schema.chargeContracts).where(eq(schema.chargeContracts.customerId, id));
    if (charges.length) throw new UserError(`${c.fullName} tem ${charges.length} venda(s) a prestações nas Cobranças. Apague-as lá primeiro.`);
    const rentals = await db.select({ id: schema.rentals.id, status: schema.rentals.status }).from(schema.rentals).where(eq(schema.rentals.customerId, id));
    if (rentals.some((r) => r.status === "active")) throw new UserError(`${c.fullName} tem um aluguer a decorrer. Registe a devolução ou cancele-o primeiro (página Aluguer).`);
    const docs = await db.select().from(schema.documents).where(and(eq(schema.documents.ownerType, "customer"), eq(schema.documents.ownerId, id)));
    const forms = await db.select({ id: schema.generatedForms.id, fileId: schema.generatedForms.fileId }).from(schema.generatedForms).where(eq(schema.generatedForms.customerId, id));
    await db.delete(schema.documents).where(and(eq(schema.documents.ownerType, "customer"), eq(schema.documents.ownerId, id)));
    // Documentos gerados (contratos, garantias) têm dados pessoais: vão com a ficha (RGPD).
    await db.delete(schema.generatedForms).where(eq(schema.generatedForms.customerId, id));
    await db.delete(schema.rentals).where(eq(schema.rentals.customerId, id));
    await db.update(schema.leads).set({ customerId: null }).where(eq(schema.leads.customerId, id));
    await db.update(schema.vehicles).set({ buyerCustomerId: null }).where(eq(schema.vehicles.buyerCustomerId, id));
    await db.delete(schema.customers).where(eq(schema.customers.id, id));
    for (const d of docs) await removeFile(d.fileId);
    for (const f of forms) if (f.fileId) await removeFile(f.fileId);
    await audit(user, {
      action: "customer.delete",
      entityType: "customer",
      entityId: id,
      summary: `Apagou a ficha de ${c.fullName}, ${docs.length} documento(s), ${forms.length} documento(s) gerado(s) e ${rentals.length} aluguer(es) fechado(s)`,
    });
    revalidatePath("/painel/clientes");
    revalidatePath("/painel/aluguer");
  }, "Cliente apagado.");
}

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("documents.upload");
    const [d] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
    if (!d) throw new UserError("Documento não encontrado.");
    // Quem pode carregar documentos de uma viatura pode tirá-los; os do cliente pedem acesso à ficha.
    if (d.ownerType === "customer") await assertPermission("customers.edit");
    await db.delete(schema.documents).where(eq(schema.documents.id, documentId));
    await removeFile(d.fileId);
    await audit(user, { action: "document.delete", entityType: d.ownerType, entityId: d.ownerId, summary: `Apagou o documento "${d.label}"` });
    if (d.ownerType === "vehicle") {
      revalidatePath(`/painel/viaturas/${d.ownerId}`);
      revalidatePath(`/painel/estoque/${d.ownerId}`);
    } else revalidatePath(`/painel/clientes/${d.ownerId}`);
  }, "Documento apagado.");
}

export async function setDocumentKind(documentId: string, kind: string, expiresOn: string | null): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("documents.upload");
    const { DOCUMENT_KINDS } = await import("@/lib/document-kinds");
    if (!(kind in DOCUMENT_KINDS)) throw new UserError("Tipo inválido.");
    const [d] = await db.select().from(schema.documents).where(eq(schema.documents.id, documentId)).limit(1);
    if (!d) throw new UserError("Documento não encontrado.");
    if (d.ownerType === "customer") await assertPermission("customers.edit");
    await db
      .update(schema.documents)
      .set({ kind, label: DOCUMENT_KINDS[kind as keyof typeof DOCUMENT_KINDS], expiresOn: expiresOn && /^\d{4}-\d{2}-\d{2}$/.test(expiresOn) ? expiresOn : null })
      .where(eq(schema.documents.id, documentId));
    revalidatePath(d.ownerType === "vehicle" ? `/painel/viaturas/${d.ownerId}` : `/painel/clientes/${d.ownerId}`);
  });
}
