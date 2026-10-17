/**
 * Preenche o Requerimento de Registo Automóvel oficial (Modelo 1 RA, IRN) pelos nomes dos campos do PDF.
 * Contrato verbal de compra e venda: Q1 viatura, Q2 "Declaração para registo de propriedade",
 * Q3 comprador, Q4 vendedor, Q7 declaração do vendedor com a data, Q9 nº/entidade/validade dos documentos.
 * As assinaturas ficam em branco. Os campos continuam editáveis num leitor de PDF.
 */
import "server-only";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import type { RegistrationParty, RegistrationVehicle } from "@/lib/registo";
import { REGISTO_PDF_BASE64 } from "./templates/registo-pdf";

const FALLBACK: Record<string, string> = { Ł: "L", ł: "l", Đ: "D", đ: "d", Ħ: "H", ħ: "h", ı: "i" };

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
      return plain && fits(plain) ? plain : (FALLBACK[c] ?? "?");
    })
    .join("");
}

/** Parte a morada em duas linhas do formulário (a 1.ª é mais curta). */
export function splitAddress(address: string, firstMax = 46): [string, string] {
  const words = address.trim().replace(/\s+/g, " ").split(" ");
  let first = "";
  let i = 0;
  for (; i < words.length; i++) {
    const next = first ? `${first} ${words[i]}` : words[i];
    if (next.length > firstMax) break;
    first = next;
  }
  if (!first) return [address.slice(0, firstMax), address.slice(firstMax).trim()];
  return [first, words.slice(i).join(" ")];
}

const dateParts = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? { d: m[3], m: m[2], y: m[1] } : null;
};

export async function fillRegistration(input: {
  buyer: RegistrationParty;
  seller: RegistrationParty;
  vehicle: RegistrationVehicle;
  contractDate: string;
}): Promise<Buffer> {
  const pdf = await PDFDocument.load(Buffer.from(REGISTO_PDF_BASE64, "base64"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();

  const set = (name: string, value: string | undefined, opts: { upper?: boolean } = {}) => {
    let v = (value ?? "").trim().replace(/\s+/g, " ");
    if (!v) return;
    if (opts.upper !== false) v = v.toUpperCase();
    const field = form.getTextField(name);
    const max = field.getMaxLength();
    v = safeText(font, v);
    // Campos em quadradinhos (NIF, nº de documento, quadro, datas): sem espaços e letra igual em todos.
    if (field.isCombed()) v = v.replace(/\s+/g, "");
    field.setText(max ? v.slice(0, max) : v);
    if (field.isCombed()) field.setFontSize(10);
  };
  const pick = (name: string, option: string) => form.getRadioGroup(name).select(option);

  // Q1 e cabeçalho da página 2
  const { vehicle } = input;
  const make = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
  set("Matricula Q1", vehicle.plate);
  set("Marca Q1", make);
  set("Quadro N Q1", vehicle.vin.replace(/\s/g, ""));
  set("Matricula Q3", vehicle.plate);
  set("Marca Q3", make);

  // Q2: declaração para registo de propriedade (contrato verbal de compra e venda)
  pick("Registo Propriedade(1).p0", "Declaracao");

  // Q3 comprador e Q4 vendedor
  const party = (q: "Q3" | "Q4", p: RegistrationParty) => {
    const names =
      q === "Q3"
        ? { nif: "NIFNIPC 1 Q3", cp1: "cod postal 1Q3", cp2: "cod postal 2Q3", id: "N identificacao 1 Q3" }
        : { nif: "NIFNIPC Q4", cp1: "cod postal 1 Q4", cp2: "cod postal2 Q4", id: "N identificacao 1 Q4" };
    set(`Nome - firma ${q}`, p.name);
    set(names.nif, p.nif.replace(/\D/g, ""));
    const [l1, l2] = splitAddress(p.address);
    set(`ResidênciaSede ${q}`, l1);
    set(`ResidênciaSede 2 ${q}`, l2);
    const cp = p.postalCode.replace(/\D/g, "");
    set(names.cp1, cp.slice(0, 4));
    set(names.cp2, cp.slice(4, 7));
    set(`Localidade ${q}`, p.city);
    set(`Email ${q}`, p.email, { upper: false });
    if (p.kind === "empresa") {
      if (p.certCode) set(`Outro ${q}`, `CERTIDÃO ${p.certCode}`);
      return;
    }
    // Sem documento (ex.: só veio o do outro contraente) a parte fica toda em branco para escrever à mão.
    if (!p.docNumber.trim()) return;
    set(names.id, p.docNumber);
    if (p.docType === "outro") set(`Outro ${q}`, p.docTypeOther || "Outro");
    else pick(`${q} bcc`, p.docType);
  };
  party("Q3", input.buyer);
  party("Q4", input.seller);

  // Q7: declaração do vendedor com a data do contrato
  const d = dateParts(input.contractDate);
  if (d) {
    pick("Q7 1", "1");
    set("data dia Q7", d.d);
    set("data mes Q7", d.m);
    set("data ano Q7", d.y);
  }

  // Q9: documentos de quem assina (a assinatura é à mão)
  const signer = (n: "1" | "2", p: RegistrationParty) => {
    if (p.kind === "empresa") return;
    set(`N Identificacao ${n} Q9`, p.docNumber);
    set(n === "1" ? "Entidade emissora 1 Q9" : "Entidade emissora_2 Q9", p.docIssuer);
    const e = dateParts(p.docExpiry);
    if (e) {
      set(`data dia ${n} Q9`, e.d);
      set(`data mes ${n} Q9`, e.m);
      set(`data ano ${n} Q9`, e.y);
    }
  };
  signer("1", input.buyer);
  signer("2", input.seller);

  form.updateFieldAppearances(font);
  return Buffer.from(await pdf.save());
}

export function registrationFileName(vehicle: RegistrationVehicle, buyer: RegistrationParty): string {
  const base = (vehicle.plate || buyer.name || "viatura")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `requerimento-registo-${base || "viatura"}.pdf`;
}
