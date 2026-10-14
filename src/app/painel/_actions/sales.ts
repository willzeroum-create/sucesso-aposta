"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { audit, diff } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { createFormDocument } from "@/server/forms";
import { run, UserError } from "@/server/action";

const saleSchema = z.object({
  customerId: z.string().min(1, "Escolha o comprador.").max(60),
  priceEur: z.number({ error: "Indique o preço de venda." }).min(1, "Indique o preço de venda.").max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida."),
  deliveryKm: z.number().int().min(0).max(2_000_000).nullable(),
  place: z.string().trim().max(100),
  notes: z.string().trim().max(2000),
  documents: z.array(z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]])).max(5),
  markSold: z.boolean(),
});

export type SaleInput = z.input<typeof saleSchema>;

/**
 * Dá saída à viatura: associa o comprador, marca como vendida (preço, data) e gera de uma vez
 * o contrato e o termo de entrega já preenchidos com a viatura e o comprador.
 */
export async function completeSale(vehicleId: string, raw: SaleInput): Promise<ActionResult<{ documents: { title: string; url: string }[] }>> {
  return run(async () => {
    const user = await assertPermission("forms.generate");
    const input = saleSchema.parse(raw);
    if (input.markSold) await assertPermission("vehicles.status");

    const [vehicle] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
    if (!vehicle) throw new UserError("Viatura não encontrada.");
    const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, input.customerId)).limit(1);
    if (!customer) throw new UserError("Comprador não encontrado.", { customerId: "Escolha o comprador." });
    if (vehicle.status === "sold" && vehicle.buyerCustomerId && vehicle.buyerCustomerId !== customer.id && input.markSold)
      throw new UserError("Esta viatura já está vendida a outro cliente. Mude o estado primeiro se a venda foi anulada.");

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

    const sale = { priceEur: input.priceEur, date: input.date, time: input.time, place: input.place, deliveryKm: input.deliveryKm, notes: input.notes };
    const documents: { title: string; url: string }[] = [];
    for (const t of input.documents) {
      const doc = await createFormDocument(user, t, customer, current, sale);
      documents.push({ title: doc.title, url: doc.url });
    }

    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath(`/painel/clientes/${customer.id}`);
    revalidatePath("/painel/viaturas");
    if (input.markSold && vehicle.published) revalidatePath("/", "layout");
    return { documents };
  }, "Venda registada e documentos gerados.");
}
