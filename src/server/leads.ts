import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { LeadInput } from "@/lib/contracts";
import { validateLead, type LeadFieldErrors } from "@/lib/lead-client";
import { newId } from "./ids";
import { getPrivacySettings } from "./settings";
import { buildPublicCatalog } from "./public-catalog";

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export class LeadValidationError extends Error {
  constructor(public fields: LeadFieldErrors) {
    super("Reveja os campos assinalados.");
    this.name = "LeadValidationError";
  }
}

/** Converte o JSON recebido em LeadInput, sem confiar em nenhum tipo vindo do navegador. */
export function coerceLeadInput(body: unknown): LeadInput {
  const o = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const phone = s(o.phone, 60).trim();
  const vehicleId = s(o.vehicleId, 120).trim();
  return {
    fullName: s(o.fullName, 200).trim(),
    email: s(o.email, 300).trim(),
    ...(phone ? { phone } : {}),
    message: s(o.message, 3200).trim(),
    intent: s(o.intent, 20) as LeadInput["intent"],
    ...(vehicleId ? { vehicleId } : {}),
    consent: o.consent === true,
  };
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const normalizePhone = (phone?: string) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+") ? `+${digits}` : digits.length === 9 ? `+351${digits}` : `+${digits}`;
};

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.SESSION_SECRET || process.env.LEADS_IP_SALT || "sucesso-aposta";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Valida (mesmas regras do formulário + verificação da viatura publicada), descarta repetições
 * e grava. Devolve o id do pedido gravado (ou do pedido idêntico já existente).
 */
export async function acceptLead(input: LeadInput, meta: { ip: string | null; utm?: Record<string, string> }): Promise<{ leadId: string; duplicate: boolean }> {
  const errors = validateLead(input);
  if (input.vehicleId && !errors.vehicleId) {
    const catalog = await buildPublicCatalog();
    const vehicle = catalog.vehicles.find((v) => v.id === input.vehicleId);
    if (!vehicle) errors.vehicleId = "A viatura selecionada já não está disponível. Escolha outro motivo ou outra viatura.";
  }
  if (Object.keys(errors).length) throw new LeadValidationError(errors);

  const email = normalizeEmail(input.email);
  const dedupeKey = createHash("sha256")
    .update([email, input.intent, input.vehicleId ?? "", input.message.trim().toLowerCase()].join("\u0000"))
    .digest("hex");
  const [existing] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.dedupeKey, dedupeKey), gt(schema.leads.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS))))
    .limit(1);
  if (existing) return { leadId: existing.id, duplicate: true };

  const privacy = await getPrivacySettings();
  const id = newId("lead");
  const now = new Date();
  await db.insert(schema.leads).values({
    id,
    fullName: input.fullName.trim(),
    email: input.email.trim(),
    emailNormalized: email,
    phone: input.phone?.trim() || null,
    phoneNormalized: normalizePhone(input.phone),
    message: input.message.trim(),
    intent: input.intent,
    vehicleId: input.vehicleId ?? null,
    consentText: privacy.consentText,
    consentAt: now,
    dedupeKey,
    utmSource: meta.utm?.utm_source?.slice(0, 100) ?? null,
    utmMedium: meta.utm?.utm_medium?.slice(0, 100) ?? null,
    utmCampaign: meta.utm?.utm_campaign?.slice(0, 150) ?? null,
    ipHash: hashIp(meta.ip),
  });
  await db.insert(schema.leadEvents).values({
    id: newId("lev"),
    leadId: id,
    userId: null,
    userName: "Site",
    type: "status",
    body: "Pedido recebido pelo formulário do site.",
  });
  return { leadId: id, duplicate: false };
}
