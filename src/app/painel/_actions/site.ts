"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { isValidNif } from "@/lib/pt-validation";
import { audit, diff } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { getCompanyInfo, getPrivacySettings, getSiteConfig, writeSetting } from "@/server/settings";
import { run, UserError } from "@/server/action";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

const siteSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome.").max(100),
  tagline: z.string().trim().min(2, "Indique a frase de apresentação.").max(240),
  phone: opt(30).refine((v) => !v || /^\+[1-9]\d{6,14}$/.test(v.replace(/\s/g, "")), "Use o formato internacional, ex.: +351912345678."),
  email: opt(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  whatsapp: opt(20).refine((v) => !v || /^[1-9]\d{6,14}$/.test(v.replace(/\D/g, "")), "Só algarismos com indicativo, ex.: 351912345678."),
  address: opt(300),
});

/** SiteConfig — a única origem do nome e contactos públicos. */
export async function saveSiteConfig(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const d = siteSchema.parse(Object.fromEntries(form.entries()));
    const before = await getSiteConfig();
    const contacts = {
      ...(d.phone ? { phone: d.phone.replace(/\s/g, "") } : {}),
      ...(d.email ? { email: d.email } : {}),
      ...(d.whatsapp ? { whatsapp: d.whatsapp.replace(/\D/g, "") } : {}),
      ...(d.address ? { address: d.address } : {}),
    };
    const next = { name: d.name, tagline: d.tagline, locale: "pt-PT" as const, currency: "EUR" as const, ...(Object.keys(contacts).length ? { contacts } : {}) };
    await writeSetting("site", next, user.id);
    await audit(user, { action: "settings.site", entityType: "settings", entityId: "site", summary: "Atualizou o nome e os contactos do site", changes: diff(before as unknown as Record<string, unknown>, next) });
    revalidatePath("/", "layout");
  }, "Dados do site guardados.");
}

const companySchema = z.object({
  legalName: z.string().trim().max(200),
  nipc: z.string().trim().max(20).transform((v) => v.replace(/\D/g, "")).refine((v) => !v || isValidNif(v), "NIPC inválido."),
  address: z.string().trim().max(300),
  postalCode: z.string().trim().max(20),
  city: z.string().trim().max(100),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "E-mail inválido."),
  instagram: z.string().trim().max(80),
  representativeName: z.string().trim().max(160),
  representativeRole: z.string().trim().max(80),
  licenseNumber: z.string().trim().max(60),
});

export async function saveCompany(form: FormData, kind: "sale" | "rent" = "sale"): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const data = companySchema.parse(Object.fromEntries(form.entries()));
    const before = await getCompanyInfo(kind);
    await writeSetting(kind === "sale" ? "company" : "company_rent", data, user.id);
    await audit(user, {
      action: "settings.company",
      entityType: "settings",
      entityId: kind === "sale" ? "company" : "company_rent",
      summary: `Atualizou os dados da empresa de ${kind === "sale" ? "vendas" : "aluguer"}`,
      changes: diff(before as unknown as Record<string, unknown>, data),
    });
  }, "Dados da empresa guardados.");
}

export async function savePrivacy(form: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const data = z
      .object({
        consentText: z.string().trim().min(10, "Escreva o texto do consentimento.").max(600),
        policyUrl: z.string().trim().max(300).refine((v) => !v || /^https:\/\//.test(v) || v.startsWith("/"), "Use um endereço https:// ou um caminho do site."),
        leadRetentionMonths: z.coerce.number().int().min(1).max(120),
      })
      .parse(Object.fromEntries(form.entries()));
    const before = await getPrivacySettings();
    await writeSetting("privacy", data, user.id);
    await audit(user, { action: "settings.privacy", entityType: "settings", entityId: "privacy", summary: "Atualizou as regras de privacidade", changes: diff(before as unknown as Record<string, unknown>, data) });
  }, "Privacidade guardada.");
}

export async function saveTemplate(id: string, title: string, body: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    if (!TEMPLATE_IDS.includes(id as TemplateId)) throw new UserError("Modelo inválido.");
    if (title.trim().length < 3 || title.length > 150) throw new UserError("Título inválido.");
    if (body.trim().length < 20 || body.length > 20_000) throw new UserError("O texto do modelo é demasiado curto ou longo.");
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "templates")).limit(1);
    const all = { ...((row?.value ?? {}) as Record<string, unknown>), [id]: { title: title.trim(), body: body.trim() } };
    await writeSetting("templates", all, user.id);
    await audit(user, { action: "settings.template", entityType: "template", entityId: id, summary: `Editou o modelo "${title.trim()}"` });
    revalidatePath("/painel/configuracoes");
  }, "Modelo guardado.");
}

export async function resetTemplate(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "templates")).limit(1);
    const all = { ...((row?.value ?? {}) as Record<string, unknown>) };
    delete all[id];
    await writeSetting("templates", all, user.id);
    await audit(user, { action: "settings.template_reset", entityType: "template", entityId: id, summary: "Repôs o texto original de um modelo" });
    revalidatePath("/painel/configuracoes");
  }, "Texto original reposto.");
}

/* ── Capas do site (HeroSlide) ── */

const position = z
  .string()
  .trim()
  .regex(/^(?:(?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)% (?:100(?:\.0+)?|\d{1,2}(?:\.\d+)?)%|(?:left|center|right)(?: (?:top|center|bottom))?)$/, "Enquadramento inválido.");
const image = z.string().trim().regex(/^\/media\/[\w-]+\/[\w.-]+\.(webp|jpg|png)$/, "Escolha uma fotografia da viatura.");

const heroSchema = z.object({
  vehicleId: z.string().min(1, "Escolha a viatura.").max(60),
  imageDesktop: image,
  imageMobile: image,
  objectPositionDesktop: position,
  objectPositionMobile: position,
  textTone: z.enum(["light", "dark"]),
  eyebrow: z.string().trim().min(1, "Escreva a frase de abertura.").max(150),
  headline: z.string().trim().min(1, "Escreva o título.").max(160),
  headlineAccent: z.string().trim().max(160).optional().transform((v) => v || null),
  description: z.string().trim().min(1, "Escreva a descrição.").max(500),
});

export async function saveHero(id: string | null, input: z.input<typeof heroSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const data = heroSchema.parse(input);
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, data.vehicleId)).limit(1);
    if (!v) throw new UserError("Viatura não encontrada.");
    if (id) {
      const [before] = await db.select().from(schema.heroSlides).where(eq(schema.heroSlides.id, id)).limit(1);
      if (!before) throw new UserError("Capa não encontrada.");
      await db.update(schema.heroSlides).set({ ...data, updatedBy: user.id, updatedAt: new Date() }).where(eq(schema.heroSlides.id, id));
      await audit(user, { action: "hero.update", entityType: "hero", entityId: id, summary: `Editou a capa de ${v.make} ${v.model}`, changes: diff(before, data) });
      revalidatePath("/painel/site");
      if (before.published) revalidatePath("/", "layout");
      return { id };
    }
    const all = await db.select({ position: schema.heroSlides.position }).from(schema.heroSlides);
    const newHeroId = newId("hero");
    await db.insert(schema.heroSlides).values({ id: newHeroId, ...data, position: all.length ? Math.max(...all.map((h) => h.position)) + 1 : 0, published: false, updatedBy: user.id });
    await audit(user, { action: "hero.create", entityType: "hero", entityId: newHeroId, summary: `Criou uma capa com ${v.make} ${v.model} (rascunho)` });
    revalidatePath("/painel/site");
    return { id: newHeroId };
  }, "Capa guardada.");
}

export async function setHeroPublished(id: string, published: boolean): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const [h] = await db.select().from(schema.heroSlides).where(eq(schema.heroSlides.id, id)).limit(1);
    if (!h) throw new UserError("Capa não encontrada.");
    if (published) {
      const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, h.vehicleId)).limit(1);
      if (!v?.published || v.status === "preparation") throw new UserError("A viatura desta capa tem de estar publicada no site.");
      const live = await db.select({ id: schema.heroSlides.id }).from(schema.heroSlides).where(eq(schema.heroSlides.published, true));
      if (live.length >= 12) throw new UserError("Máximo de 12 capas publicadas.");
    }
    await db.update(schema.heroSlides).set({ published, updatedBy: user.id, updatedAt: new Date() }).where(eq(schema.heroSlides.id, id));
    await audit(user, { action: published ? "hero.publish" : "hero.unpublish", entityType: "hero", entityId: id, summary: published ? "Publicou uma capa no site" : "Retirou uma capa do site" });
    revalidatePath("/painel/site");
    revalidatePath("/", "layout");
  }, published ? "Capa publicada." : "Capa retirada do site.");
}

export async function moveHero(id: string, direction: -1 | 1): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("site.edit");
    const list = await db.select().from(schema.heroSlides).orderBy(asc(schema.heroSlides.position));
    const i = list.findIndex((h) => h.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [k, h] of list.entries()) await db.update(schema.heroSlides).set({ position: k }).where(eq(schema.heroSlides.id, h.id));
    revalidatePath("/painel/site");
    revalidatePath("/", "layout");
  });
}

export async function deleteHero(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("site.edit");
    const [h] = await db.select().from(schema.heroSlides).where(eq(schema.heroSlides.id, id)).limit(1);
    if (!h) throw new UserError("Capa não encontrada.");
    await db.delete(schema.heroSlides).where(eq(schema.heroSlides.id, id));
    await audit(user, { action: "hero.delete", entityType: "hero", entityId: id, summary: "Apagou uma capa" });
    revalidatePath("/painel/site");
    if (h.published) revalidatePath("/", "layout");
  }, "Capa apagada.");
}
