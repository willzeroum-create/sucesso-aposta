"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { allocatePayment, isIsoDate, PAYMENT_METHODS, toCents, todayLisbon } from "@/lib/cobrancas";
import { isValidNif } from "@/lib/pt-validation";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { run, UserError } from "@/server/action";

const money = (label: string, { allowZero = false } = {}) =>
  z.coerce
    .number({ message: `${label}: indique um valor.` })
    .refine((n) => Number.isFinite(n) && (allowZero ? n >= 0 : n > 0), `${label} inválido.`)
    .refine((n) => n <= 10_000_000, `${label} demasiado alto.`);
const isoDate = z.string().refine(isIsoDate, "Data inválida.");
const method = z.enum(Object.keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS, ...(keyof typeof PAYMENT_METHODS)[]]).default("dinheiro");

const contractSchema = z
  .object({
    customerId: z.string().max(60).optional(),
    newCustomer: z
      .object({
        fullName: z.string().trim().min(2, "Indique o nome do cliente.").max(160),
        phone: z.string().trim().max(30).default(""),
        nif: z.string().trim().max(20).default(""),
        email: z.string().trim().max(254).default(""),
      })
      .optional(),
    vehicleId: z.string().max(60).nullable().optional(),
    vehicle: z.object({
      make: z.string().trim().max(80).default(""),
      model: z.string().trim().max(120).default(""),
      color: z.string().trim().max(60).default(""),
      year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
      plate: z.string().trim().max(20).default(""),
      vin: z.string().trim().max(20).default(""),
    }),
    deliveryDate: isoDate.nullable().optional(),
    sale: money("Valor de venda"),
    financed: money("Valor financiado", { allowZero: true }).default(0),
    downPayment: money("Entrada", { allowZero: true }).default(0),
    debt: money("Valor da dívida"),
    notes: z.string().trim().max(4000).default(""),
    installments: z.array(z.object({ dueDate: isoDate, amount: money("Valor da prestação") })).max(240).default([]),
  })
  .superRefine((v, ctx) => {
    if (!v.customerId && !v.newCustomer) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Escolha ou crie o cliente." });
    if (!v.vehicle.make && !v.vehicle.model) ctx.addIssue({ code: "custom", path: ["vehicle", "model"], message: "Indique a marca ou o modelo." });
    if (v.downPayment > v.sale) ctx.addIssue({ code: "custom", path: ["downPayment"], message: "A entrada é maior do que a venda." });
    if (v.newCustomer?.nif && !isValidNif(v.newCustomer.nif.replace(/\D/g, ""))) ctx.addIssue({ code: "custom", path: ["newCustomer", "nif"], message: "NIF inválido." });
  });

export type NewChargeContract = z.input<typeof contractSchema>;

const refresh = (id?: string) => {
  revalidatePath("/painel/cobrancas");
  if (id) revalidatePath(`/painel/cobrancas/${id}`);
};

export async function createChargeContract(raw: NewChargeContract): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const d = contractSchema.parse(raw);
    let customerId = d.customerId;
    if (customerId) {
      const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, customerId)).limit(1);
      if (!c) throw new UserError("Cliente não encontrado.");
    } else if (d.newCustomer) {
      customerId = newId("cus");
      const nif = d.newCustomer.nif.replace(/\D/g, "") || null;
      await db.insert(schema.customers).values({
        id: customerId,
        fullName: d.newCustomer.fullName,
        phone: d.newCustomer.phone || null,
        email: d.newCustomer.email || null,
        nif,
        source: "Cobranças",
        createdBy: user.id,
      });
    }
    const id = newId("cob");
    await db.insert(schema.chargeContracts).values({
      id,
      customerId: customerId!,
      vehicleId: d.vehicleId || null,
      make: d.vehicle.make,
      model: d.vehicle.model,
      color: d.vehicle.color,
      year: d.vehicle.year ?? null,
      plate: d.vehicle.plate.toUpperCase(),
      vin: d.vehicle.vin.toUpperCase(),
      deliveryDate: d.deliveryDate ?? null,
      saleCents: toCents(d.sale),
      financedCents: toCents(d.financed),
      downCents: toCents(d.downPayment),
      debtCents: toCents(d.debt),
      notes: d.notes,
      createdBy: user.id,
    });
    for (const i of d.installments) await db.insert(schema.chargeInstallments).values({ id: newId("pre"), contractId: id, dueDate: i.dueDate, amountCents: toCents(i.amount) });
    await audit(user, {
      action: "charge.create",
      entityType: "charge",
      entityId: id,
      summary: `Registou venda a prestações: ${[d.vehicle.make, d.vehicle.model].filter(Boolean).join(" ")} — ${d.installments.length} prestação(ões)`,
    });
    refresh(id);
    return { id };
  }, "Venda a prestações registada.");
}

export async function updateChargeContract(
  id: string,
  raw: { notes?: string; deliveryDate?: string | null; sale?: number; down?: number; debt?: number; financed?: number; vehicleId?: string | null },
): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const d = z
      .object({
        notes: z.string().trim().max(4000).optional(),
        deliveryDate: isoDate.nullable().optional(),
        sale: money("Valor de venda").optional(),
        down: money("Entrada", { allowZero: true }).optional(),
        debt: money("Valor da dívida").optional(),
        financed: money("Valor financiado", { allowZero: true }).optional(),
        vehicleId: z.string().max(60).nullable().optional(),
      })
      .parse(raw);
    const [c] = await db.select().from(schema.chargeContracts).where(eq(schema.chargeContracts.id, id)).limit(1);
    if (!c) throw new UserError("Venda não encontrada.");
    const sale = d.sale !== undefined ? toCents(d.sale) : c.saleCents;
    const down = d.down !== undefined ? toCents(d.down) : c.downCents;
    if (down > sale) throw new UserError("A entrada é maior do que a venda.", { down: "Maior do que a venda." });
    await db
      .update(schema.chargeContracts)
      .set({
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.deliveryDate !== undefined ? { deliveryDate: d.deliveryDate } : {}),
        ...(d.vehicleId !== undefined ? { vehicleId: d.vehicleId || null } : {}),
        ...(d.financed !== undefined ? { financedCents: toCents(d.financed) } : {}),
        ...(d.debt !== undefined ? { debtCents: toCents(d.debt) } : {}),
        saleCents: sale,
        downCents: down,
        updatedAt: new Date(),
      })
      .where(eq(schema.chargeContracts.id, id));
    await audit(user, { action: "charge.update", entityType: "charge", entityId: id, summary: "Atualizou uma venda a prestações" });
    refresh(id);
  }, "Guardado.");
}

export async function deleteChargeContract(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const [c] = await db.select().from(schema.chargeContracts).where(eq(schema.chargeContracts.id, id)).limit(1);
    if (!c) throw new UserError("Venda não encontrada.");
    await db.delete(schema.chargeContracts).where(eq(schema.chargeContracts.id, id));
    await audit(user, { action: "charge.delete", entityType: "charge", entityId: id, summary: `Apagou a venda a prestações de ${[c.make, c.model].filter(Boolean).join(" ")}` });
    refresh();
  }, "Venda apagada.");
}

export async function addInstallments(contractId: string, raw: { dueDate: string; amount: number }[]): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const list = z.array(z.object({ dueDate: isoDate, amount: money("Valor da prestação") })).min(1, "Indique pelo menos uma prestação.").max(240).parse(raw);
    const [c] = await db.select({ id: schema.chargeContracts.id }).from(schema.chargeContracts).where(eq(schema.chargeContracts.id, contractId)).limit(1);
    if (!c) throw new UserError("Venda não encontrada.");
    for (const i of list) await db.insert(schema.chargeInstallments).values({ id: newId("pre"), contractId, dueDate: i.dueDate, amountCents: toCents(i.amount) });
    await audit(user, { action: "charge.installments", entityType: "charge", entityId: contractId, summary: `Acrescentou ${list.length} prestação(ões)` });
    refresh(contractId);
  }, "Prestações acrescentadas.");
}

async function paidOn(installmentId: string) {
  const rows = await db.select({ c: schema.chargePayments.amountCents }).from(schema.chargePayments).where(eq(schema.chargePayments.installmentId, installmentId));
  return rows.reduce((s, r) => s + r.c, 0);
}

export async function updateInstallment(id: string, raw: { dueDate?: string; amount?: number; note?: string }): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("billing.manage");
    const d = z.object({ dueDate: isoDate.optional(), amount: money("Valor").optional(), note: z.string().trim().max(300).optional() }).parse(raw);
    const [i] = await db.select().from(schema.chargeInstallments).where(eq(schema.chargeInstallments.id, id)).limit(1);
    if (!i) throw new UserError("Prestação não encontrada.");
    const amountCents = d.amount !== undefined ? toCents(d.amount) : i.amountCents;
    if (amountCents < (await paidOn(id))) throw new UserError("O valor não pode ser menor do que o já recebido nesta prestação.");
    await db.update(schema.chargeInstallments).set({ dueDate: d.dueDate ?? i.dueDate, amountCents, note: d.note ?? i.note }).where(eq(schema.chargeInstallments.id, id));
    refresh(i.contractId);
  }, "Prestação atualizada.");
}

export async function deleteInstallment(id: string): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("billing.manage");
    const [i] = await db.select().from(schema.chargeInstallments).where(eq(schema.chargeInstallments.id, id)).limit(1);
    if (!i) throw new UserError("Prestação não encontrada.");
    if ((await paidOn(id)) > 0) throw new UserError("Esta prestação já tem pagamento. Desfaça o pagamento antes de apagar.");
    await db.delete(schema.chargeInstallments).where(eq(schema.chargeInstallments.id, id));
    refresh(i.contractId);
  }, "Prestação apagada.");
}

const paymentSchema = z.object({
  amount: money("Valor").optional(),
  date: isoDate.optional(),
  method,
  note: z.string().trim().max(300).default(""),
});

async function registerPayment(userId: string, contractId: string, cents: number, p: z.infer<typeof paymentSchema>, preferredId: string | null) {
  const inst = await db.select().from(schema.chargeInstallments).where(eq(schema.chargeInstallments.contractId, contractId));
  const paid = await db
    .select({ id: schema.chargePayments.installmentId, c: schema.chargePayments.amountCents })
    .from(schema.chargePayments)
    .where(and(eq(schema.chargePayments.contractId, contractId), isNotNull(schema.chargePayments.installmentId)));
  const paidBy = new Map<string, number>();
  for (const r of paid) if (r.id) paidBy.set(r.id, (paidBy.get(r.id) ?? 0) + r.c);
  const parts = allocatePayment(
    inst.map((i) => ({ id: i.id, dueDate: i.dueDate, missingCents: i.amountCents - (paidBy.get(i.id) ?? 0) })),
    cents,
    preferredId,
  );
  for (const part of parts)
    await db.insert(schema.chargePayments).values({
      id: newId("pag"),
      contractId,
      installmentId: part.installmentId,
      date: p.date ?? todayLisbon(),
      amountCents: part.cents,
      method: p.method,
      note: p.note,
      createdBy: userId,
    });
}

/** Marca uma prestação como recebida (sem valor = o que falta). */
export async function payInstallment(id: string, raw: z.input<typeof paymentSchema> = {}): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const p = paymentSchema.parse(raw);
    const [i] = await db.select().from(schema.chargeInstallments).where(eq(schema.chargeInstallments.id, id)).limit(1);
    if (!i) throw new UserError("Prestação não encontrada.");
    const missing = i.amountCents - (await paidOn(id));
    if (missing <= 0) throw new UserError("Esta prestação já está paga.");
    const cents = p.amount !== undefined ? toCents(p.amount) : missing;
    await registerPayment(user.id, i.contractId, cents, p, id);
    await audit(user, { action: "charge.pay", entityType: "charge", entityId: i.contractId, summary: `Registou recebimento de ${(cents / 100).toFixed(2)} €` });
    refresh(i.contractId);
  }, "Recebimento registado.");
}

/** Pagamento avulso: abate nas prestações em aberto mais antigas. */
export async function addPayment(contractId: string, raw: z.input<typeof paymentSchema>): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const p = paymentSchema.parse(raw);
    if (p.amount === undefined) throw new UserError("Indique o valor recebido.");
    const [c] = await db.select({ id: schema.chargeContracts.id }).from(schema.chargeContracts).where(eq(schema.chargeContracts.id, contractId)).limit(1);
    if (!c) throw new UserError("Venda não encontrada.");
    await registerPayment(user.id, contractId, toCents(p.amount), p, null);
    await audit(user, { action: "charge.pay", entityType: "charge", entityId: contractId, summary: `Registou recebimento de ${p.amount.toFixed(2)} €` });
    refresh(contractId);
  }, "Recebimento registado.");
}

export async function undoInstallment(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const [i] = await db.select().from(schema.chargeInstallments).where(eq(schema.chargeInstallments.id, id)).limit(1);
    if (!i) throw new UserError("Prestação não encontrada.");
    await db.delete(schema.chargePayments).where(eq(schema.chargePayments.installmentId, id));
    await audit(user, { action: "charge.undo", entityType: "charge", entityId: i.contractId, summary: "Desfez o recebimento de uma prestação" });
    refresh(i.contractId);
  }, "Recebimento desfeito.");
}

export async function deletePayment(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("billing.manage");
    const [p] = await db.select().from(schema.chargePayments).where(eq(schema.chargePayments.id, id)).limit(1);
    if (!p) throw new UserError("Pagamento não encontrado.");
    await db.delete(schema.chargePayments).where(eq(schema.chargePayments.id, id));
    await audit(user, { action: "charge.payment_delete", entityType: "charge", entityId: p.contractId, summary: `Apagou um recebimento de ${(p.amountCents / 100).toFixed(2)} €` });
    refresh(p.contractId);
  }, "Pagamento apagado.");
}
