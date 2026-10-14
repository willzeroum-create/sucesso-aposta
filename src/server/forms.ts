import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_TEMPLATES, fillPlaceholders, type FormTemplate, type TemplateId } from "@/lib/form-templates";
import { formatDatePt, formatPlate } from "@/lib/pt-validation";
import { getCompanyInfo } from "./settings";

type Customer = typeof schema.customers.$inferSelect;
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

export async function buildValues(customer: Customer | null, vehicle: VehicleRow | null, sale: SaleInput): Promise<Record<string, string>> {
  const company = await getCompanyInfo();
  const now = new Date();
  const companyAddress = [company.address, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const customerAddress = customer
    ? [customer.address, [customer.postalCode, customer.city].filter(Boolean).join(" "), customer.country && customer.country !== "Portugal" ? customer.country : ""]
        .filter(Boolean)
        .join(", ")
    : "";
  const price = sale.priceEur ?? vehicle?.soldPriceEur ?? vehicle?.priceEur ?? null;
  const date = sale.date || now.toISOString().slice(0, 10);
  return {
    "empresa.nome": company.legalName,
    "empresa.nipc": company.nipc,
    "empresa.morada": companyAddress,
    "empresa.representante": company.representativeName,
    "empresa.cargo": company.representativeRole,
    "cliente.nome": customer?.fullName ?? "",
    "cliente.nif": customer?.nif ?? "",
    "cliente.documento": customer ? [customer.idDocumentType, customer.idDocumentNumber].filter(Boolean).join(" nº ") : "",
    "cliente.validade_documento": formatDatePt(customer?.idDocumentExpiry),
    "cliente.morada": customerAddress,
    "cliente.telefone": customer?.phone ?? "",
    "cliente.email": customer?.email ?? "",
    "cliente.carta": customer?.drivingLicenseNumber ?? "",
    "cliente.nascimento": formatDatePt(customer?.birthDate),
    "cliente.nacionalidade": customer?.nationality ?? "",
    "viatura.marca": vehicle?.make ?? "",
    "viatura.modelo": vehicle ? [vehicle.model, vehicle.version].filter(Boolean).join(" ") : "",
    "viatura.matricula": vehicle?.plate ? formatPlate(vehicle.plate) : "",
    "viatura.vin": vehicle?.vin ?? "",
    "viatura.ano": vehicle?.year ? String(vehicle.year) : "",
    "viatura.primeira_matricula": formatDatePt(vehicle?.firstRegistration),
    "viatura.km": vehicle?.mileageKm != null ? `${vehicle.mileageKm.toLocaleString("pt-PT")}` : "",
    "viatura.cor": vehicle?.color ?? "",
    "viatura.combustivel": vehicle?.fuel ? fuelPt[vehicle.fuel] : "",
    "venda.preco": price ? eur.format(price) : "",
    "venda.data": formatDatePt(date),
    "venda.hora": sale.time || now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }),
    "venda.local": sale.place || company.city,
    "venda.km_entrega":
      sale.deliveryKm != null ? sale.deliveryKm.toLocaleString("pt-PT") : vehicle?.mileageKm != null ? vehicle.mileageKm.toLocaleString("pt-PT") : "",
    "venda.observacoes": sale.notes?.trim() ?? "",
  };
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
