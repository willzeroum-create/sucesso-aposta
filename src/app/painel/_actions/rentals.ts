"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { lisbonDate } from "@/lib/rentals";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { run, UserError } from "@/server/action";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.");

async function load(id: string) {
  const [r] = await db.select().from(schema.rentals).where(eq(schema.rentals.id, id)).limit(1);
  if (!r) throw new UserError("Aluguer não encontrado.");
  const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, r.vehicleId)).limit(1);
  return { r, v: v! };
}

function refresh(vehicleId: string) {
  revalidatePath("/painel/aluguer");
  revalidatePath(`/painel/aluguer/${vehicleId}`);
  revalidatePath(`/painel/viaturas/${vehicleId}`);
  revalidatePath(`/painel/estoque/${vehicleId}`);
}

/** Devolução: fecha o aluguer, guarda a data/hora e os km de entrega (e atualiza os km da viatura). */
export async function returnRental(id: string, raw: { date: string; time: string; kmIn?: number | null; notes?: string }): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.status");
    const d = z
      .object({ date: isoDate, time: hhmm, kmIn: z.number().int().min(0).max(2_000_000).nullable().optional(), notes: z.string().trim().max(2000).optional() })
      .parse(raw);
    const { r, v } = await load(id);
    if (r.status !== "active") throw new UserError("Este aluguer já está fechado.");
    if (d.kmIn != null && r.kmOut != null && d.kmIn < r.kmOut) throw new UserError(`Os km de entrega não podem ser menos do que os de saída (${r.kmOut}).`, { kmIn: "Menor do que os km de saída." });
    const returnedAt = lisbonDate(d.date, d.time);
    await db
      .update(schema.rentals)
      .set({
        status: "closed",
        returnedAt,
        kmIn: d.kmIn ?? null,
        notes: d.notes ? [r.notes, `Devolução: ${d.notes}`].filter(Boolean).join("\n") : r.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.rentals.id, id));
    if (d.kmIn != null && (v.mileageKm == null || d.kmIn > v.mileageKm))
      await db.update(schema.vehicles).set({ mileageKm: d.kmIn, updatedAt: new Date() }).where(eq(schema.vehicles.id, v.id));
    await audit(user, {
      action: "vehicle.rent_return",
      entityType: "vehicle",
      entityId: v.id,
      summary: `Registou a devolução de ${v.make} ${v.model}${v.plate ? ` (${v.plate})` : ""}${d.kmIn != null ? ` com ${d.kmIn} km` : ""}`,
    });
    refresh(v.id);
  }, "Devolução registada.");
}

/** Prolongar: nova data de fim e, se indicado, novo valor total. */
export async function extendRental(id: string, raw: { date: string; time: string; totalEur?: number | null }): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.status");
    const d = z.object({ date: isoDate, time: hhmm, totalEur: z.number().min(0).max(10_000_000).nullable().optional() }).parse(raw);
    const { r, v } = await load(id);
    if (r.status !== "active") throw new UserError("Só se prolonga um aluguer a decorrer.");
    const endAt = lisbonDate(d.date, d.time);
    if (endAt <= r.startAt) throw new UserError("O fim tem de ser depois do início.", { endDate: "Antes do início." });
    await db
      .update(schema.rentals)
      .set({ endAt, ...(d.totalEur !== undefined ? { totalEur: d.totalEur } : {}), updatedAt: new Date() })
      .where(eq(schema.rentals.id, id));
    await audit(user, {
      action: "vehicle.rent_extend",
      entityType: "vehicle",
      entityId: v.id,
      summary: `Alterou o fim do aluguer de ${v.make} ${v.model} para ${d.date.split("-").reverse().join("/")} ${d.time}`,
    });
    refresh(v.id);
  }, "Aluguer atualizado.");
}

/** Cancelar um aluguer registado por engano (fica no histórico como cancelado). */
export async function cancelRental(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.status");
    const { r, v } = await load(id);
    if (r.status !== "active") throw new UserError("Este aluguer já está fechado.");
    await db.update(schema.rentals).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.rentals.id, id));
    await audit(user, { action: "vehicle.rent_cancel", entityType: "vehicle", entityId: v.id, summary: `Cancelou um aluguer de ${v.make} ${v.model}` });
    refresh(v.id);
  }, "Aluguer cancelado.");
}

/** Apaga um aluguer do histórico (devolvido ou cancelado), ex.: registos de teste. */
export async function deleteRental(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("vehicles.status");
    const { r, v } = await load(id);
    if (r.status === "active") throw new UserError("Um aluguer a decorrer não se apaga: registe a devolução ou cancele-o primeiro.");
    await db.delete(schema.rentals).where(eq(schema.rentals.id, id));
    await audit(user, { action: "vehicle.rent_delete", entityType: "vehicle", entityId: v.id, summary: `Apagou um aluguer do histórico de ${v.make} ${v.model}` });
    refresh(v.id);
  }, "Aluguer apagado do histórico.");
}
