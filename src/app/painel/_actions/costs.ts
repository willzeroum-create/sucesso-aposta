"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { COST_CATEGORIES } from "@/lib/vehicle-costs";
import { audit, diff } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { run, UserError } from "@/server/action";

const costSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  category: z.enum(Object.keys(COST_CATEGORIES) as [keyof typeof COST_CATEGORIES, ...(keyof typeof COST_CATEGORIES)[]]),
  description: z.string().trim().max(300).default(""),
  amount: z.coerce.number({ message: "Indique o valor." }).positive("O valor tem de ser maior do que zero.").max(10_000_000),
});

export async function addVehicleCost(vehicleId: string, raw: z.input<typeof costSchema>): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.costs");
    const d = costSchema.parse(raw);
    const [v] = await db.select({ make: schema.vehicles.make, model: schema.vehicles.model }).from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    await db.insert(schema.vehicleCosts).values({ id: newId("cst"), vehicleId, date: d.date, category: d.category, description: d.description, amountEur: d.amount, createdBy: user.id });
    await audit(user, {
      action: "vehicle.cost",
      entityType: "vehicle",
      entityId: vehicleId,
      summary: `Registou custo de ${d.amount.toFixed(2)} € (${COST_CATEGORIES[d.category]}) em ${v.make} ${v.model}`,
    });
    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath(`/painel/estoque/${vehicleId}`);
    revalidatePath("/painel/estoque");
  }, "Custo registado.");
}

export async function deleteVehicleCost(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.costs");
    const [c] = await db.select().from(schema.vehicleCosts).where(eq(schema.vehicleCosts.id, id)).limit(1);
    if (!c) throw new UserError("Custo não encontrado.");
    await db.delete(schema.vehicleCosts).where(eq(schema.vehicleCosts.id, id));
    await audit(user, { action: "vehicle.cost_delete", entityType: "vehicle", entityId: c.vehicleId, summary: `Apagou um custo de ${c.amountEur.toFixed(2)} €` });
    revalidatePath(`/painel/viaturas/${c.vehicleId}`);
    revalidatePath(`/painel/estoque/${c.vehicleId}`);
    revalidatePath("/painel/estoque");
  }, "Custo apagado.");
}

export async function setPurchasePrice(vehicleId: string, amount: number | null): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.costs");
    await assertPermission("vehicles.edit");
    const value = amount === null ? null : z.coerce.number().min(0).max(100_000_000).parse(amount);
    const [v] = await db.select({ before: schema.vehicles.purchasePriceEur }).from(schema.vehicles).where(eq(schema.vehicles.id, vehicleId)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    await db.update(schema.vehicles).set({ purchasePriceEur: value, updatedAt: new Date() }).where(eq(schema.vehicles.id, vehicleId));
    await audit(user, { action: "vehicle.update", entityType: "vehicle", entityId: vehicleId, summary: "Atualizou o preço de compra", changes: diff({ purchasePriceEur: v.before }, { purchasePriceEur: value }) });
    revalidatePath(`/painel/viaturas/${vehicleId}`);
    revalidatePath(`/painel/estoque/${vehicleId}`);
    revalidatePath("/painel/estoque");
  }, "Preço de compra guardado.");
}
