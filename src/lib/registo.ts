/**
 * Requerimento de Registo Automóvel (Modelo 1 RA do IRN) — compra e venda por contrato verbal.
 * Q3 = sujeito ativo (COMPRADOR), Q4 = sujeito passivo (VENDEDOR), Q7 = declaração de venda com a data,
 * Q9 = assinaturas (à mão) com o nº e a validade do documento de cada um.
 */

export type PartyKind = "empresa" | "particular";
/** Tipo de documento no formulário: BI, Cartão de Cidadão, Cédula profissional ou Outro. */
export type PartyDocType = "cc" | "bi" | "cp" | "outro";

export interface RegistrationParty {
  kind: PartyKind;
  name: string;
  nif: string;
  docType: PartyDocType;
  /** Nome do documento quando é "Outro" (ex.: Título de Residência, Passaporte). */
  docTypeOther: string;
  docNumber: string;
  docIssuer: string;
  /** Validade do documento, AAAA-MM-DD. */
  docExpiry: string;
  /** Empresa: código de acesso à certidão permanente. */
  certCode: string;
  address: string;
  postalCode: string;
  city: string;
  email: string;
}

export interface RegistrationVehicle {
  plate: string;
  make: string;
  model: string;
  vin: string;
}

/**
 * Checklist do pagamento no fim da compra e venda: valores (texto em euros, como foi escrito),
 * se ficou algo por pagar, como vai ser pago e se passou para as Cobranças.
 */
export interface RegistrationPayment {
  sale: string;
  down: string;
  bank: string;
  /** Vazio = venda − entrada − banco. */
  pending: string;
  owed: "" | "sim" | "nao";
  how: "" | "vista" | "prestacoes";
  toCharges: "" | "sim" | "nao";
  /** À vista: data combinada para pagar. */
  dueDate: string;
  notes: string;
  /** Venda a prestações criada a partir daqui. */
  chargeId: string;
}
export const emptyPayment = (): RegistrationPayment => ({ sale: "", down: "", bank: "", pending: "", owed: "", how: "", toCharges: "", dueDate: "", notes: "", chargeId: "" });

/** "12.500,50" / "12500.5" / "12 500 €" → 12500.5 (NaN se não for número). */
export const parseEurosText = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

/** O que ficou por pagar: o valor escrito ou, se vazio, venda − entrada − banco. */
export function paymentPending(p: RegistrationPayment): number {
  if (p.pending.trim()) return Math.max(0, parseEurosText(p.pending) || 0);
  const n = (v: string) => (v.trim() ? parseEurosText(v) || 0 : 0);
  return Math.max(0, Math.round((n(p.sale) - n(p.down) - n(p.bank)) * 100) / 100);
}

export const REGISTRATION_STATUS = {
  draft: "Em preparação",
  generated: "Requerimento gerado",
  submitted: "Entregue no registo",
  done: "Registado",
} as const;
export type RegistrationStatus = keyof typeof REGISTRATION_STATUS;

export const DOC_TYPE_LABEL: Record<PartyDocType, string> = { cc: "Cartão de Cidadão", bi: "Bilhete de Identidade", cp: "Cédula profissional", outro: "Outro" };

type FieldMeta<K> = { key: K; label: string; required?: boolean; wide?: boolean; type?: "date" | "email"; numeric?: boolean; placeholder?: string };

export const PARTY_FIELDS: FieldMeta<keyof RegistrationParty>[] = [
  { key: "name", label: "Nome / firma", required: true, wide: true },
  { key: "nif", label: "NIF / NIPC", required: true, numeric: true },
  { key: "docNumber", label: "Nº do documento" },
  { key: "docTypeOther", label: "Que documento (se Outro)", placeholder: "ex.: Título de Residência" },
  { key: "docIssuer", label: "Entidade emissora" },
  { key: "docExpiry", label: "Validade do documento", type: "date" },
  { key: "certCode", label: "Código da certidão permanente", placeholder: "0000-0000-0000" },
  { key: "address", label: "Morada / sede", required: true, wide: true },
  { key: "postalCode", label: "Código postal", required: true, placeholder: "0000-000" },
  { key: "city", label: "Localidade", required: true },
  { key: "email", label: "E-mail (opcional)", type: "email" },
];

export const VEHICLE_FIELDS_RA: FieldMeta<keyof RegistrationVehicle>[] = [
  { key: "plate", label: "Matrícula" },
  { key: "make", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "vin", label: "Nº de quadro (VIN)", wide: true },
];

export function emptyParty(kind: PartyKind = "particular"): RegistrationParty {
  return { kind, name: "", nif: "", docType: "cc", docTypeOther: "", docNumber: "", docIssuer: "", docExpiry: "", certCode: "", address: "", postalCode: "", city: "", email: "" };
}
export const emptyRegistrationVehicle = (): RegistrationVehicle => ({ plate: "", make: "", model: "", vin: "" });

/** "Cartão de Cidadão" → cc; "Título de Residência" → outro (com o nome). */
export function docTypeFrom(text: string): { docType: PartyDocType; docTypeOther: string } {
  const s = text.trim().toLowerCase();
  if (!s) return { docType: "cc", docTypeOther: "" };
  if (/cidad|^cc$/.test(s)) return { docType: "cc", docTypeOther: "" };
  if (/bilhete|^bi$/.test(s)) return { docType: "bi", docTypeOther: "" };
  if (/c[ée]dula/.test(s)) return { docType: "cp", docTypeOther: "" };
  return { docType: "outro", docTypeOther: text.trim() };
}

/** Entidade emissora habitual quando o documento não a diz. */
export function defaultIssuer(p: Pick<RegistrationParty, "docType" | "docTypeOther">): string {
  if (p.docType === "cc" || p.docType === "bi") return "República Portuguesa";
  if (/resid/i.test(p.docTypeOther)) return "AIMA";
  return "";
}

const blank = (v: unknown) => String(v ?? "").trim() === "";

export function registrationMissing(buyer: RegistrationParty, seller: RegistrationParty, vehicle: RegistrationVehicle, contractDate: string): string[] {
  const out: string[] = [];
  for (const f of VEHICLE_FIELDS_RA) if (f.required && blank(vehicle[f.key])) out.push(`Viatura: ${f.label.toLowerCase()}`);
  for (const [role, p] of [["Comprador", buyer], ["Vendedor", seller]] as const) {
    for (const f of PARTY_FIELDS) if (f.required && blank(p[f.key])) out.push(`${role}: ${f.label.toLowerCase()}`);
    if (p.kind === "particular" && blank(p.docNumber)) out.push(`${role}: nº do documento`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contractDate)) out.push("Data da venda");
  return out;
}
