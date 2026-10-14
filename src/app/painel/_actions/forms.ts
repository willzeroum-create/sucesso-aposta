"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { buildValues, getTemplates, missingValues, renderPdf } from "@/server/forms";
import { newId } from "@/server/ids";
import { getSiteConfig } from "@/server/settings";
import { storeGenerated } from "@/server/storage";
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
    const { template, customer, vehicle, values } = await load(input);
    const id = newId("frm");
    const site = await getSiteConfig();
    const pdf = await renderPdf(template, values, { reference: id.slice(-10).toUpperCase(), standName: site.name });
    const name = `${template.title} - ${customer?.fullName ?? vehicle?.plate ?? id}.pdf`.replace(/[\\/:*?"<>|]/g, "");
    const stored = await storeGenerated(pdf, "application/pdf", name, user.id);
    await db.insert(schema.generatedForms).values({ id, template: input.template, customerId: customer?.id ?? null, vehicleId: vehicle?.id ?? null, data: values, fileId: stored.id, createdBy: user.id });
    await audit(user, {
      action: "form.generate",
      entityType: vehicle ? "vehicle" : "customer",
      entityId: vehicle?.id ?? customer?.id ?? null,
      summary: `Gerou "${template.title}"${customer ? ` para ${customer.fullName}` : ""}${vehicle ? ` — ${vehicle.make} ${vehicle.model}${vehicle.plate ? ` ${vehicle.plate}` : ""}` : ""}`,
    });
    if (vehicle) revalidatePath(`/painel/viaturas/${vehicle.id}`);
    if (customer) revalidatePath(`/painel/clientes/${customer.id}`);
    return { id, url: `/api/admin/files/${stored.id}` };
  }, "Documento gerado.");
}
