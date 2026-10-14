"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema, } from "@/db";
import { LEAD_STATUSES } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { run, UserError } from "@/server/action";

const LABEL: Record<(typeof LEAD_STATUSES)[number], string> = {
  new: "Novo",
  contacted: "Contactado",
  qualified: "Qualificado",
  negotiation: "Em negociação",
  won: "Ganho",
  lost: "Perdido",
};

async function loadLead(id: string) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id)).limit(1);
  if (!lead) throw new UserError("Pedido não encontrado.");
  return lead;
}

export async function setLeadStatus(id: string, status: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("leads.edit");
    const s = z.enum(LEAD_STATUSES).parse(status);
    const lead = await loadLead(id);
    if (lead.status === s) return;
    await db.update(schema.leads).set({ status: s, updatedAt: new Date() }).where(eq(schema.leads.id, id));
    await db.insert(schema.leadEvents).values({ id: newId("lev"), leadId: id, userId: user.id, userName: user.name, type: "status", body: `${LABEL[lead.status]} → ${LABEL[s]}` });
    await audit(user, { action: "lead.status", entityType: "lead", entityId: id, summary: `Pedido de ${lead.fullName}: ${LABEL[lead.status]} → ${LABEL[s]}` });
    revalidatePath("/painel/crm");
    revalidatePath(`/painel/crm/${id}`);
  });
}

export async function assignLead(id: string, userId: string | null): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("leads.edit");
    const lead = await loadLead(id);
    let name = "ninguém";
    if (userId) {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!u || !u.active) throw new UserError("Utilizador inválido.");
      name = u.name;
    }
    await db.update(schema.leads).set({ assignedTo: userId, updatedAt: new Date() }).where(eq(schema.leads.id, id));
    await db.insert(schema.leadEvents).values({ id: newId("lev"), leadId: id, userId: user.id, userName: user.name, type: "assign", body: `Atribuído a ${name}` });
    await audit(user, { action: "lead.assign", entityType: "lead", entityId: id, summary: `Pedido de ${lead.fullName} atribuído a ${name}` });
    revalidatePath("/painel/crm");
    revalidatePath(`/painel/crm/${id}`);
  });
}

export async function addLeadNote(id: string, body: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("leads.edit");
    await loadLead(id);
    const text = body.trim();
    if (!text) throw new UserError("Escreva a nota.");
    if (text.length > 4000) throw new UserError("Nota demasiado longa.");
    await db.insert(schema.leadEvents).values({ id: newId("lev"), leadId: id, userId: user.id, userName: user.name, type: "note", body: text });
    await db.update(schema.leads).set({ updatedAt: new Date() }).where(eq(schema.leads.id, id));
    revalidatePath(`/painel/crm/${id}`);
  }, "Nota adicionada.");
}

/** Cria (ou associa) a ficha de cliente a partir do pedido de contacto. */
export async function convertLeadToCustomer(id: string): Promise<ActionResult<{ customerId: string }>> {
  return run(async () => {
    const user = await assertPermission("customers.edit");
    await assertPermission("leads.edit");
    const lead = await loadLead(id);
    if (lead.customerId) return { customerId: lead.customerId };
    const customerId = newId("cus");
    await db.insert(schema.customers).values({ id: customerId, fullName: lead.fullName, email: lead.email, phone: lead.phone, source: "Site", notes: `Pedido de contacto: ${lead.message}`.slice(0, 4000), createdBy: user.id });
    await db.update(schema.leads).set({ customerId, status: lead.status === "new" ? "contacted" : lead.status, updatedAt: new Date() }).where(eq(schema.leads.id, id));
    await db.insert(schema.leadEvents).values({ id: newId("lev"), leadId: id, userId: user.id, userName: user.name, type: "link", body: "Ficha de cliente criada a partir do pedido." });
    await audit(user, { action: "lead.convert", entityType: "lead", entityId: id, summary: `Criou a ficha de cliente de ${lead.fullName} a partir do pedido` });
    revalidatePath(`/painel/crm/${id}`);
    revalidatePath("/painel/clientes");
    return { customerId };
  }, "Ficha de cliente criada.");
}

/** Pedido recebido por telefone/presencial, registado manualmente. */
export async function createManualLead(form: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("leads.edit");
    const data = z
      .object({
        fullName: z.string().trim().min(2, "Indique o nome.").max(120),
        email: z.string().trim().max(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
        phone: z.string().trim().max(30),
        message: z.string().trim().min(2, "Descreva o pedido.").max(3000),
        source: z.string().trim().max(60),
        vehicleId: z.string().trim().max(60),
      })
      .refine((v) => v.email || v.phone, { message: "Indique e-mail ou telefone.", path: ["phone"] })
      .parse(Object.fromEntries(form.entries()));
    const id = newId("lead");
    const now = new Date();
    await db.insert(schema.leads).values({
      id,
      fullName: data.fullName,
      email: data.email,
      emailNormalized: data.email.toLowerCase(),
      phone: data.phone || null,
      phoneNormalized: data.phone ? data.phone.replace(/[^\d+]/g, "") : null,
      message: data.message,
      intent: data.vehicleId ? "vehicle" : "general",
      vehicleId: data.vehicleId || null,
      consentText: "Registado manualmente pela equipa.",
      consentAt: now,
      source: data.source || "Manual",
      assignedTo: user.id,
      dedupeKey: newId("manual"),
    });
    await db.insert(schema.leadEvents).values({ id: newId("lev"), leadId: id, userId: user.id, userName: user.name, type: "status", body: `Registado manualmente (${data.source || "Manual"}).` });
    await audit(user, { action: "lead.create", entityType: "lead", entityId: id, summary: `Registou manualmente o pedido de ${data.fullName}` });
    revalidatePath("/painel/crm");
    return { id };
  }, "Pedido registado.");
}
