"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { removeFile } from "@/server/storage";
import { buildValues, createFormDocument, getTemplates, missingValues } from "@/server/forms";
import { run, UserError } from "@/server/action";

const inputSchema = z.object({
  template: z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]),
  customerId: z.string().max(60).nullable(),
  vehicleId: z.string().max(60).nullable(),
  sale: z.object({
    priceEur: z.number().min(0).max(100_000_000).nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
    place: z.string().max(100).optional(),
    deliveryKm: z.number().int().min(0).max(2_000_000).nullable().optional(),
    notes: z.string().max(2000).optional(),
  }),
});

async function load(input: z.infer<typeof inputSchema>) {
  const templates = await getTemplates();
  const template = templates[input.template];
  const customer = input.customerId ? (await db.select().from(schema.customers).where(eq(schema.customers.id, input.customerId)).limit(1))[0] ?? null : null;
  const vehicle = input.vehicleId ? (await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, input.vehicleId)).limit(1))[0] ?? null : null;
  if (template.needsCustomer && !customer) throw new UserError("Escolha o cliente.");
  if (template.needsVehicle && !vehicle) throw new UserError("Escolha a viatura.");
  const values = await buildValues(customer, vehicle, input.sale);
  return { template, customer, vehicle, values };
}

/** Pré-visualização: devolve os campos que ficariam em branco. */
export async function previewForm(raw: z.input<typeof inputSchema>): Promise<ActionResult<{ missing: string[]; values: Record<string, string> }>> {
  return run(async () => {
    await assertPermission("forms.generate");
    const { template, values } = await load(inputSchema.parse(raw));
    return { missing: missingValues(template, values), values };
  });
}

export async function generateForm(raw: z.input<typeof inputSchema>): Promise<ActionResult<{ id: string; url: string }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const input = inputSchema.parse(raw);
    const { customer, vehicle } = await load(input);
    const doc = await createFormDocument(user, input.template, customer, vehicle, input.sale);
    if (vehicle) revalidatePath(`/painel/viaturas/${vehicle.id}`);
    if (customer) revalidatePath(`/painel/clientes/${customer.id}`);
    return { id: doc.id, url: doc.url };
  }, "Documento gerado.");
}

/** Apaga um documento gerado (ex.: gerado por engano ou de teste) e o PDF/Word dele. */
export async function deleteGeneratedForm(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const [f] = await db.select().from(schema.generatedForms).where(eq(schema.generatedForms.id, id)).limit(1);
    if (!f) throw new UserError("Documento não encontrado.");
    await db.delete(schema.generatedForms).where(eq(schema.generatedForms.id, id));
    if (f.fileId) await removeFile(f.fileId);
    await audit(user, { action: "form.delete", entityType: f.vehicleId ? "vehicle" : "customer", entityId: f.vehicleId ?? f.customerId, summary: `Apagou um documento gerado (${f.template})` });
    revalidatePath("/painel/declaracoes");
    if (f.vehicleId) {
      revalidatePath(`/painel/viaturas/${f.vehicleId}`);
      revalidatePath(`/painel/estoque/${f.vehicleId}`);
    }
    if (f.customerId) revalidatePath(`/painel/clientes/${f.customerId}`);
  }, "Documento apagado.");
}
