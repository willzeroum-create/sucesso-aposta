/**
 * Gera o Modelo 9 do IMT já preenchido (porta do LegalCar, com coordenadas calibradas no PDF oficial).
 * O PDF não tem campos de formulário: o texto é desenhado na página 1 (A4, 595×841 pt, origem em baixo
 * à esquerda). Os campos do requerente são quadradinhos (uma letra por célula, passo de 10 pt, MAIÚSCULAS).
 * Assinatura, data e área dos serviços ficam em branco — o requerente assina à mão.
 */
import "server-only";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { categoriaPT, numero, paisOrigemValido, tipoPT, type Modelo9Requester, type Modelo9Vehicle } from "@/lib/modelo9";
import { MODELO9_PDF_BASE64 } from "./templates/modelo9-pdf";

const STEP = 10;

/** Letras sem equivalente na fonte padrão (WinAnsi) que não se resolvem tirando o acento. */
const FALLBACK: Record<string, string> = { Ł: "L", ł: "l", Đ: "D", đ: "d", Ħ: "H", ħ: "h", Ŧ: "T", ŧ: "t", ı: "i", Ŀ: "L", ŀ: "l" };

/** A fonte padrão só tem o alfabeto latino (WinAnsi): letra a letra, tira o acento ou troca por "?". */
function safeText(font: PDFFont, text: string): string {
  const fits = (s: string) => {
    try {
      font.encodeText(s);
      return true;
    } catch {
      return false;
    }
  };
  if (fits(text)) return text;
  return [...text]
    .map((c) => {
      if (fits(c)) return c;
      const plain = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (plain && fits(plain)) return plain;
      return FALLBACK[c] ?? "?";
    })
    .join("");
}

export async function fillModelo9(requester: Modelo9Requester, vehicle: Modelo9Vehicle): Promise<Buffer> {
  const pdf = await PDFDocument.load(Buffer.from(MODELO9_PDF_BASE64, "base64"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page: PDFPage = pdf.getPages()[0];

  /** Texto livre numa linha, encolhido para caber na largura disponível. */
  const put = (value: string | undefined, x: number, y: number, maxWidth: number, size = 8) => {
    const t = safeText(font, (value ?? "").toString().trim().replace(/\s+/g, " "));
    if (!t) return;
    const s = Math.max(5, Math.min(size, maxWidth / Math.max(1, font.widthOfTextAtSize(t, 1))));
    page.drawText(t, { x, y, size: s, font });
  };
  const tick = (x: number, y: number) => page.drawText("X", { x, y, size: 10, font });
  /** Quadradinhos: uma letra por célula; se não couber, escreve seguido e encolhido sobre as células. */
  const cells = (value: string | undefined, x0: number, y: number, capacity: number, opts: { size?: number; upper?: boolean } = {}) => {
    let t = safeText(font, (value ?? "").toString().trim().replace(/\s+/g, " "));
    if (opts.upper !== false) t = t.toUpperCase();
    if (!t) return;
    if (t.length <= capacity) {
      for (let i = 0; i < t.length; i++) if (t[i] !== " ") page.drawText(t[i], { x: x0 + i * STEP, y, size: opts.size ?? 8, font });
    } else put(t, x0 - 1, y, capacity * STEP - 1, opts.size ?? 8);
  };
  const digits = (s: string | undefined) => (s ?? "").replace(/\D/g, "");

  // Pretensão: atribuição de matrícula + homologação + inspeção (carro importado).
  tick(63, 672);
  tick(244, 654);
  tick(429, 646);

  // Requerente. Nome: 45 células na 1.ª linha e 48 na 2.ª.
  const name = (requester.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length <= 45) cells(name, 93.5, 591, 45);
  else {
    const cut = name.lastIndexOf(" ", 45);
    const first = cut > 20 ? name.slice(0, cut) : name.slice(0, 45);
    cells(first, 93.5, 591, 45);
    cells(name.slice(first.length).trim(), 57.5, 570.5, 48);
  }
  cells(requester.address, 99, 550, 44);
  cells(requester.city, 120, 527, 20);
  const cp = digits(requester.postalCode);
  cells(cp.length >= 5 ? `${cp.slice(0, 4)} ${cp.slice(4, 7)}` : cp, 387, 527, 8); // espaço = célula do hífen
  cells(digits(requester.nif), 308, 507, 9);
  cells(digits(requester.phone).slice(-9), 450.5, 507, 9);
  cells(requester.email, 225, 487, 31, { size: 7.5, upper: false });
  if (requester.kind === "particular") cells((requester.docNumber ?? "").replace(/\s+/g, ""), 170, 464, 10);
  else put(requester.certCode, 302, 414.5, 236, 9);

  // Características do veículo (à direita de cada rótulo).
  put(vehicle.make, 360, 343, 178);
  put(vehicle.model, 95, 329, 208);
  put(vehicle.homologation, 375, 329, 163);
  put(vehicle.category || categoriaPT(vehicle), 105, 314, 100);
  put(vehicle.purpose || tipoPT(vehicle), 230, 314, 100);
  put(vehicle.color, 352, 314, 186);
  put(vehicle.vin, 105, 299, 195);
  put(vehicle.engineNumber, 360, 299, 178);
  put(vehicle.fuel, 115, 284, 132);
  put(vehicle.cylinders, 320, 284, 76);
  put(vehicle.engineCc, 445, 284, 93);
  const unit = (v: string | undefined, u: string) => {
    const t = (v ?? "").trim();
    return t && /^[\d.,\s]+$/.test(t) ? `${t} ${u}` : t;
  };
  put(unit(vehicle.wheelbaseMm, "mm"), 276, 209.5, 82);
  put(unit(vehicle.grossWeightKg, "kg"), 414, 209.5, 124);
  put(unit(vehicle.tareKg, "kg"), 78, 192.8, 60);
  const seats = numero(vehicle.seats);
  put(seats ? String(seats) : "", 468, 192.8, 70);
  put(vehicle.foreignPlate, 117, 177.8, 98);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec((vehicle.firstRegistration ?? "").trim());
  if (date) {
    put(date[1], 247, 177.8, 26);
    put(date[2], 282.5, 177.8, 12);
    put(date[3], 302.5, 177.8, 12);
  }
  put(paisOrigemValido(vehicle.originCountry), 374, 176.8, 164);

  return Buffer.from(await pdf.save());
}

export function modelo9FileName(vehicle: Modelo9Vehicle, requester: Modelo9Requester): string {
  const base = (vehicle.foreignPlate || vehicle.vin || requester.name || "viatura")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `modelo9-${base || "viatura"}.pdf`;
}
