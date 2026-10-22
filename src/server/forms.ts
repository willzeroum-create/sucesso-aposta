import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { eurosPorExtenso } from "@/lib/extenso";
import { DEFAULT_TEMPLATES, fillPlaceholders, type FormTemplate, type TemplateId } from "@/lib/form-templates";
import { formatDatePt, formatPlate } from "@/lib/pt-validation";
import { getCompanyInfo } from "./settings";

export interface TemplateFileInfo {
  fileId: string;
  name: string;
  uploadedAt: string;
  uploadedBy: string;
  fields: string[];
}

/** Modelos Word carregados pelo stand (um por tipo de documento). */
export async function getTemplateFiles(): Promise<Partial<Record<TemplateId, TemplateFileInfo>>> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "templateFiles")).limit(1);
  return (row?.value ?? {}) as Partial<Record<TemplateId, TemplateFileInfo>>;
}

type Customer = typeof schema.customers.$inferSelect;

/** Documentos Word incluídos no painel (recriados dos originais do stand). */
export async function bundledDocx(templateId: string): Promise<Buffer | null> {
  const { BUNDLED_DOCX } = await import("./templates/bundled");
  const b64 = BUNDLED_DOCX[templateId];
  return b64 ? Buffer.from(b64, "base64") : null;
}
type VehicleRow = typeof schema.vehicles.$inferSelect;

export async function getTemplates(): Promise<Record<TemplateId, FormTemplate>> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "templates")).limit(1);
  const overrides = (row?.value ?? {}) as Partial<Record<TemplateId, { title?: string; body?: string }>>;
  const out = { ...DEFAULT_TEMPLATES };
  for (const id of Object.keys(out) as TemplateId[]) {
    const o = overrides[id];
    if (o) out[id] = { ...out[id], ...(o.title ? { title: o.title } : {}), ...(o.body ? { body: o.body } : {}) };
  }
  return out;
}

const fuelPt: Record<string, string> = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" };
const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

export interface SaleInput {
  priceEur?: number | null;
  date?: string;
  time?: string;
  place?: string;
  deliveryKm?: number | null;
  notes?: string;
}

export interface WarrantyInput {
  months?: number | null;
  number?: string;
  start?: string;
  delivery?: string;
  extras?: string;
}

export interface RentalInput {
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  kmOut?: number | null;
  totalEur?: number | null;
  paymentMethod?: string;
  condition?: string;
}

/** Carro que o cliente deixa no stand para vender (Contrato de consignação). */
export interface ConsignmentInput {
  make?: string;
  model?: string;
  plate?: string;
  year?: number | null;
  vin?: string;
  km?: number | null;
  minPriceEur?: number | null;
  iban?: string;
}

export type DocContext = { mode?: "sale" | "rent"; warranty?: WarrantyInput; rental?: RentalInput; consignment?: ConsignmentInput };

/** "pt50000201231234567890154" → "PT50 0002 0123 1234 5678 9015 4". */
export function formatIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1 ");
}
const int = new Intl.NumberFormat("pt-PT");

export const DEFAULT_RENT_PAYMENT = "Pago por transferência bancária MBWAY/IBAN ou em dinheiro no ato da assinatura.";
export const DEFAULT_RENT_CONDITION =
  "O veículo é entregue em bom estado de funcionamento, limpo e sem danos aparentes, salvo os desgastes normais já anotados em auto de vistoria próprio.";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-09-17" → "17 de setembro de 2026". */
export function dateLong(iso?: string | null): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}` : "";
}
/** "2026-09-17" → "17-09-2026". */
const dateDash = (iso?: string | null) => {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}
/** "17:00" → "17"; "17:30" → "17:30". */
const hourText = (t?: string) => (t ? t.replace(/:00$/, "") : "");
const amount = (v: number) => v.toFixed(2);

export async function buildValues(
  customer: Customer | null,
  vehicle: VehicleRow | null,
  sale: SaleInput,
  ctx: DocContext = {},
): Promise<Record<string, string>> {
  const mode = ctx.mode ?? "sale";
  const company = await getCompanyInfo(mode);
  const now = new Date();
  const companyAddress = [company.address, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const customerAddress = customer
    ? [customer.address, [customer.postalCode, customer.city].filter(Boolean).join(" "), customer.country && customer.country !== "Portugal" ? customer.country : ""]
        .filter(Boolean)
        .join(", ")
    : "";
  const price = sale.priceEur ?? vehicle?.soldPriceEur ?? vehicle?.priceEur ?? null;
  const date = sale.date || now.toISOString().slice(0, 10);
  const km = sale.deliveryKm ?? vehicle?.mileageKm ?? null;
  const vehicleType = (vehicle?.vehicleType ?? "").toLowerCase();
  const fourByFour = /4x4|awd|4wd|4matic|xdrive|quattro|4motion|all4|dual motor/i.test(`${vehicle?.version ?? ""} ${vehicle?.vehicleType ?? ""}`);

  const w = ctx.warranty ?? {};
  const wStart = w.start || date;
  const wMonths = w.months ?? 18;
  const r = ctx.rental ?? {};
  const k = ctx.consignment ?? {};

  return {
    "empresa.nome": company.legalName,
    "empresa.nipc": company.nipc,
    "empresa.morada": companyAddress,
    "empresa.morada_rua": company.address,
    "empresa.codigo_postal": company.postalCode,
    "empresa.localidade": company.city,
    "empresa.telefone": company.phone,
    "empresa.email": company.email,
    "empresa.instagram": company.instagram,
    "empresa.representante": company.representativeName,
    "empresa.cargo": company.representativeRole,
    "cliente.nome": customer?.fullName ?? "",
    "cliente.nif": customer?.nif ?? "",
    "cliente.documento": customer ? [customer.idDocumentType, customer.idDocumentNumber].filter(Boolean).join(" ") : "",
    "cliente.numero_documento": customer?.idDocumentNumber ?? "",
    "cliente.validade_documento": formatDatePt(customer?.idDocumentExpiry),
    "cliente.morada": customerAddress,
    "cliente.morada_rua": customer?.address ?? "",
    "cliente.codigo_postal": customer?.postalCode ?? "",
    "cliente.localidade": customer?.city ?? "",
    "cliente.telefone": customer?.phone ?? "",
    "cliente.email": customer?.email ?? "",
    "cliente.carta": customer?.drivingLicenseNumber ?? "",
    "cliente.carta_emissao": formatDatePt(customer?.drivingLicenseIssuedAt),
    "cliente.nascimento": formatDatePt(customer?.birthDate),
    "cliente.nacionalidade": customer?.nationality ?? "",
    "viatura.marca": vehicle?.make ?? "",
    "viatura.modelo": vehicle?.model ?? "",
    "viatura.versao": vehicle?.version ?? "",
    "viatura.marca_modelo": vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ") : "",
    "viatura.matricula": vehicle?.plate ? formatPlate(vehicle.plate) : "",
    "viatura.vin": vehicle?.vin ?? "",
    "viatura.ano": vehicle?.year ? String(vehicle.year) : "",
    "viatura.primeira_matricula": formatDatePt(vehicle?.firstRegistration),
    "viatura.primeiro_registo": dateDash(vehicle?.firstRegistration),
    "viatura.km": vehicle?.mileageKm != null ? String(vehicle.mileageKm) : "",
    "viatura.cor": vehicle?.color ?? "",
    "viatura.combustivel": vehicle?.fuel ? fuelPt[vehicle.fuel] : "",
    "viatura.transmissao": vehicle?.transmission ? (vehicle.transmission === "automatic" ? "Automática" : "Manual") : "",
    "viatura.cilindrada": vehicle?.engineCc ? String(vehicle.engineCc) : "",
    "viatura.potencia_kw": vehicle?.powerHp ? String(Math.round(vehicle.powerHp / 1.35962)) : "",
    "viatura.tracao_4x4": vehicle ? (fourByFour ? "Sim" : "Não") : "",
    "viatura.categoria_pt": vehicle ? (vehicle.grossWeightKg && vehicle.grossWeightKg > 3500 ? "Pesados" : "Ligeiros") : "",
    "viatura.tipo_pt": vehicle ? (/mercad|n1|n2|n3/.test(vehicleType) ? "Mercadorias" : "Passageiros") : "",
    "viatura.lugares": vehicle?.seats ? String(vehicle.seats) : "",
    "venda.preco": price ? eur.format(price) : "",
    "venda.data": formatDatePt(date),
    "venda.data_extenso": dateLong(date),
    "venda.hora": sale.time || now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }),
    "venda.local": sale.place || company.city,
    "venda.km_entrega": km != null ? String(km) : "",
    "venda.observacoes": sale.notes?.trim() ?? "",
    "garantia.prazo": wMonths ? String(wMonths) : "",
    "garantia.numero": w.number?.trim() ?? "",
    "garantia.inicio": dateDash(wStart),
    "garantia.fim": wMonths ? dateDash(addMonths(wStart, wMonths)) : "",
    "garantia.entrega": dateDash(w.delivery || date),
    "garantia.complementos": w.extras?.trim() ?? "",
    "consignacao.marca": k.make?.trim() ?? "",
    "consignacao.modelo": k.model?.trim() ?? "",
    "consignacao.matricula": k.plate?.trim() ? formatPlate(k.plate) : "",
    "consignacao.ano": k.year ? String(k.year) : "",
    "consignacao.vin": k.vin?.trim().toUpperCase() ?? "",
    "consignacao.km": k.km != null ? `${int.format(k.km)} km` : "",
    "consignacao.preco_minimo": k.minPriceEur ? eur.format(k.minPriceEur) : "",
    "consignacao.preco_extenso": k.minPriceEur ? eurosPorExtenso(k.minPriceEur) : "",
    "consignacao.iban": k.iban?.trim() ? formatIban(k.iban) : "",
    "aluguer.inicio": dateLong(r.startDate),
    "aluguer.inicio_hora": hourText(r.startTime),
    "aluguer.fim": dateLong(r.endDate),
    "aluguer.fim_hora": hourText(r.endTime),
    "aluguer.km_saida": r.kmOut != null ? String(r.kmOut) : vehicle?.mileageKm != null ? String(vehicle.mileageKm) : "",
    "aluguer.valor": r.totalEur != null ? amount(r.totalEur) : "",
    "aluguer.forma_pagamento": r.paymentMethod?.trim() || DEFAULT_RENT_PAYMENT,
    "aluguer.estado_geral": r.condition?.trim() || DEFAULT_RENT_CONDITION,
  };
}

/** Campos {{...}} usados por um modelo (documento Word carregado ou texto-base). */
export async function templateFieldKeys(templateId: TemplateId): Promise<string[]> {
  const word = (await getTemplateFiles())[templateId];
  if (word) return word.fields;
  const bundled = await bundledDocx(templateId);
  if (bundled) {
    const { inspectDocx } = await import("./docx-template");
    return inspectDocx(bundled).fields;
  }
  const template = (await getTemplates())[templateId];
  const used = new Set<string>();
  const scan = (t: string) => t.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => (used.add(k), ""));
  scan(template.body);
  template.table.flat().forEach((c) => scan(c.value));
  template.signatures.forEach(scan);
  return [...used];
}

/** Campos que ficaram por preencher (para avisar antes de imprimir). */
export function missingValues(template: FormTemplate, values: Record<string, string>): string[] {
  const used = new Set<string>();
  const scan = (t: string) => t.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => (used.add(k), ""));
  scan(template.body);
  template.table.flat().forEach((c) => scan(c.value));
  template.signatures.forEach(scan);
  return [...used].filter((k) => k !== "venda.observacoes" && !values[k]?.trim());
}

/* ── PDF ── */

const A4 = { w: 595.28, h: 841.89 };
const M = 56;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** WinAnsi (fontes padrão do PDF) não tem alguns caracteres; troca-os por equivalentes. */
function safe(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF€\n]/g, "");
}

export async function renderPdf(template: FormTemplate, values: Record<string, string>, meta: { reference: string; standName: string }): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(template.title);
  pdf.setCreator(meta.standName || "Painel do stand");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.15, 0.14);
  const muted = rgb(0.42, 0.43, 0.4);
  const line = rgb(0.8, 0.8, 0.77);
  let page: PDFPage = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const width = A4.w - 2 * M;

  const ensure = (needed: number) => {
    if (y - needed < M + 30) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };

  // Cabeçalho
  page.drawText(safe(values["empresa.nome"] || meta.standName), { x: M, y, size: 9, font: bold, color: muted });
  const ref = safe(`Ref. ${meta.reference}`);
  page.drawText(ref, { x: A4.w - M - font.widthOfTextAtSize(ref, 9), y, size: 9, font, color: muted });
  y -= 34;
  for (const l of wrap(safe(template.title), bold, 17, width)) {
    page.drawText(l, { x: M, y, size: 17, font: bold, color: ink });
    y -= 22;
  }
  y -= 8;

  // Texto
  const body = safe(fillPlaceholders(template.body, values));
  for (const paragraph of body.split(/\n\s*\n/)) {
    for (const l of wrap(paragraph.trim(), font, 10.5, width)) {
      ensure(15);
      page.drawText(l, { x: M, y, size: 10.5, font, color: ink });
      y -= 15;
    }
    y -= 8;
  }

  // Quadro de dados
  if (template.table.length) {
    y -= 6;
    for (const row of template.table) {
      ensure(36);
      const cellW = width / row.length;
      row.forEach((cell, i) => {
        const x = M + i * cellW;
        page.drawRectangle({ x, y: y - 30, width: cellW, height: 34, borderColor: line, borderWidth: 0.7 });
        page.drawText(safe(cell.label), { x: x + 6, y: y - 7, size: 7.5, font, color: muted });
        const value = safe(fillPlaceholders(cell.value, values));
        let size = 10;
        while (size > 6.5 && bold.widthOfTextAtSize(value, size) > cellW - 12) size -= 0.5;
        page.drawText(value, { x: x + 6, y: y - 22, size, font: bold, color: ink });
      });
      y -= 34;
    }
  }

  // Assinaturas
  if (template.signatures.length) {
    ensure(110);
    y -= 70;
    const n = template.signatures.length;
    const sw = (width - (n - 1) * 30) / n;
    template.signatures.forEach((label, i) => {
      const x = M + i * (sw + 30);
      page.drawLine({ start: { x, y }, end: { x: x + sw, y }, thickness: 0.7, color: ink });
      for (const [j, l] of wrap(safe(fillPlaceholders(label, values)), font, 8.5, sw).entries())
        page.drawText(l, { x, y: y - 12 - j * 11, size: 8.5, font, color: muted });
    });
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const t = `${i + 1} / ${pages.length}`;
    p.drawText(t, { x: A4.w - M - font.widthOfTextAtSize(t, 8), y: 28, size: 8, font, color: muted });
  });
  return Buffer.from(await pdf.save());
}

/** Gera o PDF de um modelo, guarda-o e regista-o (usado pelos termos avulsos e pela venda). */
export async function createFormDocument(
  user: { id: string; name: string },
  templateId: string,
  customer: Customer | null,
  vehicle: VehicleRow | null,
  sale: SaleInput,
  overrides: Record<string, string> = {},
  ctx: DocContext = {},
): Promise<{ id: string; fileId: string; title: string; url: string; format: "docx" | "pdf" }> {
  const { getSiteConfig } = await import("./settings");
  const { storeGenerated } = await import("./storage");
  const { newId } = await import("./ids");
  const { audit } = await import("./audit");
  const templates = await getTemplates();
  const template = templates[templateId as keyof typeof templates];
  if (!template) throw new Error(`Modelo desconhecido: ${templateId}`);
  const values = { ...(await buildValues(customer, vehicle, sale, { ...ctx, mode: ctx.mode ?? (template.mode === "rent" ? "rent" : "sale") })) };
  // Valores revistos/completados pela pessoa antes de gerar.
  for (const [k, v] of Object.entries(overrides)) if (typeof v === "string" && v.trim()) values[k] = v.trim();
  const id = newId("frm");
  values["documento.referencia"] = id.slice(-10).toUpperCase();
  const site = await getSiteConfig();
  // Declarações avulsas não têm cliente/viatura registados: o nome vem dos dados escritos.
  const who = customer?.fullName || values["cliente.nome"] || vehicle?.plate || values["viatura.matricula"] || values["consignacao.matricula"] || id;
  const wordTemplate = (await getTemplateFiles())[templateId as TemplateId];
  const bundled = wordTemplate ? null : await bundledDocx(templateId);
  let stored;
  if (wordTemplate || bundled) {
    // Documento do stand em Word: preenche os campos e mantém o formato original.
    const { getObject } = await import("./storage");
    const { fillDocx, DOCX_MIME } = await import("./docx-template");
    let original = bundled;
    if (wordTemplate) {
      const [file] = await db.select().from(schema.files).where(eq(schema.files.id, wordTemplate.fileId)).limit(1);
      original = file ? await getObject(file.storageKey) : null;
    }
    if (!original) throw new Error("O modelo Word deste documento não foi encontrado. Volte a carregá-lo em Configurações.");
    const docx = fillDocx(original, values);
    stored = await storeGenerated(docx, DOCX_MIME, `${template.title} - ${who}.docx`.replace(/[\\/:*?"<>|]/g, ""), user.id);
  } else {
    const pdf = await renderPdf(template, values, { reference: values["documento.referencia"], standName: site.name });
    stored = await storeGenerated(pdf, "application/pdf", `${template.title} - ${who}.pdf`.replace(/[\\/:*?"<>|]/g, ""), user.id);
  }
  await db.insert(schema.generatedForms).values({ id, template: templateId, customerId: customer?.id ?? null, vehicleId: vehicle?.id ?? null, data: values, fileId: stored.id, createdBy: user.id });
  await audit(user, {
    action: "form.generate",
    entityType: vehicle ? "vehicle" : "customer",
    entityId: vehicle?.id ?? customer?.id ?? null,
    summary: `Gerou "${template.title}"${customer ? ` para ${customer.fullName}` : ""}${vehicle ? ` — ${vehicle.make} ${vehicle.model}${vehicle.plate ? ` ${vehicle.plate}` : ""}` : ""}`,
  });
  return { id, fileId: stored.id, title: template.title, url: `/api/admin/files/${stored.id}`, format: wordTemplate || bundled ? "docx" : "pdf" };
}
