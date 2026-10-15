/**
 * Modelo 9 do IMT ("Pretensão relativa a veículos") e homologação — dados e regras partilhados
 * entre o painel e o servidor. Regras herdadas do LegalCar:
 *   - Categoria no Modelo 9: sempre "Ligeiro" ou "Pesado" (peso bruto F.1 até 3500 kg e até 9 lugares = ligeiro).
 *   - Tipo: "Passageiros" (categoria europeia M) ou "Mercadorias" (N).
 *   - Matrícula estrangeira (campo A) e data da 1.ª matrícula (campo B) são obrigatórias; o país nunca é Portugal.
 *   - Os códigos europeus (M1, N1…) e a variante servem a homologação, não o Modelo 9.
 */

export type RequesterKind = "empresa" | "particular";

export interface Modelo9Requester {
  kind: RequesterKind;
  name: string;
  nif: string;
  /** Particular: nº do documento de identificação. */
  docNumber: string;
  /** Empresa: código de acesso à certidão permanente. */
  certCode: string;
  address: string;
  postalCode: string;
  city: string;
  email: string;
  phone: string;
}

export interface Modelo9Vehicle {
  make: string;
  model: string;
  version: string;
  variant: string;
  vin: string;
  foreignPlate: string;
  /** AAAA-MM-DD (campo B). */
  firstRegistration: string;
  originCountry: string;
  homologation: string;
  /** Categoria europeia (campo J): M1, N1… */
  euCategory: string;
  /** "Ligeiro" | "Pesado" */
  category: string;
  /** "Passageiros" | "Mercadorias" */
  purpose: string;
  color: string;
  engineNumber: string;
  fuel: string;
  cylinders: string;
  engineCc: string;
  wheelbaseMm: string;
  grossWeightKg: string;
  tareKg: string;
  seats: string;
  co2: string;
}

export const LEGALIZATION_STATUS = {
  draft: "Em preparação",
  generated: "Modelo 9 gerado",
  submitted: "Entregue no IMT",
  done: "Concluído",
} as const;
export type LegalizationStatus = keyof typeof LEGALIZATION_STATUS;

type FieldMeta<K> = { key: K; label: string; hint?: string; required?: boolean; wide?: boolean; type?: "date" | "email" | "tel"; numeric?: boolean };

export const REQUESTER_FIELDS: FieldMeta<keyof Modelo9Requester>[] = [
  { key: "name", label: "Nome / firma", required: true, wide: true },
  { key: "nif", label: "NIF / NIPC", required: true, numeric: true },
  { key: "docNumber", label: "Nº do documento de identificação", hint: "Particular" },
  { key: "certCode", label: "Código da certidão permanente", hint: "Empresa" },
  { key: "address", label: "Morada", required: true, wide: true },
  { key: "postalCode", label: "Código postal", required: true },
  { key: "city", label: "Localidade", required: true },
  { key: "email", label: "E-mail", type: "email" },
  { key: "phone", label: "Telefone", type: "tel" },
];

export const VEHICLE_FIELDS: FieldMeta<keyof Modelo9Vehicle>[] = [
  { key: "make", label: "Marca", hint: "D.1", required: true },
  { key: "model", label: "Modelo", hint: "D.3", required: true },
  { key: "vin", label: "Nº de quadro (VIN)", hint: "E", required: true, wide: true },
  { key: "foreignPlate", label: "Matrícula estrangeira", hint: "A", required: true },
  { key: "firstRegistration", label: "Data da 1.ª matrícula", hint: "B", required: true, type: "date" },
  { key: "originCountry", label: "País de origem" },
  { key: "category", label: "Categoria (Ligeiro/Pesado)" },
  { key: "purpose", label: "Tipo (Passageiros/Mercadorias)" },
  { key: "homologation", label: "Nº de homologação", hint: "K", wide: true },
  { key: "euCategory", label: "Categoria europeia", hint: "J" },
  { key: "variant", label: "Variante", hint: "D.2" },
  { key: "version", label: "Versão", hint: "D.2" },
  { key: "color", label: "Cor", hint: "R" },
  { key: "fuel", label: "Combustível", hint: "P.3" },
  { key: "engineCc", label: "Cilindrada (cm³)", hint: "P.1", numeric: true },
  { key: "cylinders", label: "Nº de cilindros", numeric: true },
  { key: "engineNumber", label: "Nº do motor" },
  { key: "seats", label: "Lotação", hint: "S.1", numeric: true },
  { key: "grossWeightKg", label: "Peso bruto (kg)", hint: "F.1", numeric: true },
  { key: "tareKg", label: "Tara (kg)", hint: "G", numeric: true },
  { key: "wheelbaseMm", label: "Distância entre eixos (mm)", numeric: true },
  { key: "co2", label: "CO₂ (g/km)", hint: "V.7", numeric: true },
];

export function emptyRequester(kind: RequesterKind = "empresa"): Modelo9Requester {
  return { kind, name: "", nif: "", docNumber: "", certCode: "", address: "", postalCode: "", city: "", email: "", phone: "" };
}

export function emptyVehicle(): Modelo9Vehicle {
  return Object.fromEntries(VEHICLE_FIELDS.map((f) => [f.key, ""])) as unknown as Modelo9Vehicle;
}

/** "1.880 kg" → 1880; "1880,5" → 1880.5; lixo → null. */
export function numero(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const s = (v ?? "").toString().replace(/\s|kg|mm|cm3|cm³|lugares?/gi, "");
  if (!s) return null;
  const clean = /^\d{1,3}([.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, "") : s.replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const LIMITE_LIGEIRO_KG = 3500;
export const LOTACAO_MAX_LIGEIRO = 9;

/** Ligeiro ou Pesado: pela lotação e pelo peso bruto (F.1); senão pela categoria europeia (J). */
export function categoriaPT(v: Pick<Modelo9Vehicle, "grossWeightKg" | "seats" | "euCategory">): "Ligeiro" | "Pesado" | "" {
  const weight = numero(v.grossWeightKg);
  const seats = numero(v.seats);
  if (seats !== null && seats > LOTACAO_MAX_LIGEIRO) return "Pesado";
  if (weight !== null) return weight > LIMITE_LIGEIRO_KG ? "Pesado" : "Ligeiro";
  const j = (v.euCategory ?? "").toUpperCase().replace(/\s/g, "");
  if (/^(M1|N1)/.test(j)) return "Ligeiro";
  if (/^(M2|M3|N2|N3)/.test(j)) return "Pesado";
  return "";
}

export function normalizarFinalidade(v: string | null | undefined): "Passageiros" | "Mercadorias" | "" {
  const s = (v ?? "").trim().toLowerCase();
  if (s.startsWith("passag")) return "Passageiros";
  if (s.startsWith("mercad")) return "Mercadorias";
  return "";
}

/** Passageiros (M) ou Mercadorias (N); o que foi escolhido à mão ou lido do documento prevalece. */
export function tipoPT(v: Pick<Modelo9Vehicle, "purpose" | "euCategory">): "Passageiros" | "Mercadorias" | "" {
  const chosen = normalizarFinalidade(v.purpose);
  if (chosen) return chosen;
  const j = (v.euCategory ?? "").toUpperCase().replace(/\s/g, "");
  if (j.startsWith("M")) return "Passageiros";
  if (j.startsWith("N")) return "Mercadorias";
  return "";
}

/** Data da 1.ª matrícula em AAAA-MM-DD. Aceita 15.03.2012, 15/03/2012, 2012-03-15 e 20120315. Inválida → "". */
export function normalizarDataMatricula(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  let a: string, m: string, d: string;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s))) [, a, m, d] = r;
  else if ((r = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(s))) [, d, m, a] = r;
  else if ((r = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) [, a, m, d] = r;
  else return "";
  const iso = `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return "";
  const year = Number(a);
  return year >= 1900 && year <= new Date().getUTCFullYear() + 1 ? iso : "";
}

/** País de origem de um carro importado: "Portugal" não serve. */
export function paisOrigemValido(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return !s || /^portugal$/i.test(s) ? "" : s;
}

const blank = (v: unknown) => String(v ?? "").trim() === "";

/** O que falta para o Modelo 9 poder ser entregue no IMT. */
export function modelo9Missing(requester: Modelo9Requester, vehicle: Modelo9Vehicle): string[] {
  const out: string[] = [];
  for (const f of REQUESTER_FIELDS) if (f.required && blank(requester[f.key])) out.push(f.label);
  if (requester.kind === "particular" && blank(requester.docNumber)) out.push("Nº do documento de identificação");
  for (const f of VEHICLE_FIELDS) if (f.required && blank(vehicle[f.key])) out.push(f.label);
  if (!blank(vehicle.originCountry) && !paisOrigemValido(vehicle.originCountry)) out.push("País de origem (não pode ser Portugal)");
  return out;
}

/** Campos do pedido de homologação no portal do IMT (chnac.imt-ip.pt), pela ordem do formulário. */
export function homologationFields(requester: Modelo9Requester, vehicle: Modelo9Vehicle, fallbackEmail = ""): { label: string; value: string }[] {
  const parts = requester.name.trim().split(/\s+/).filter(Boolean);
  const company = requester.kind === "empresa";
  return [
    { label: "Nome", value: company ? requester.name.trim() : (parts[0] ?? "") },
    { label: "Apelido", value: company ? "" : parts.slice(1).join(" ") },
    { label: "NIF", value: requester.nif.replace(/\D/g, "") },
    { label: "E-mail", value: requester.email || fallbackEmail },
    { label: "Veículo novo/usado", value: "Usado" },
    { label: "Nº de quadro (VIN)", value: vehicle.vin },
    { label: "Categoria europeia", value: vehicle.euCategory },
    { label: "Nº de homologação CE", value: vehicle.homologation },
    { label: "Variante", value: vehicle.variant },
    { label: "Versão", value: vehicle.version },
    { label: "Lotação", value: vehicle.seats },
    { label: "Combustível", value: vehicle.fuel },
    { label: "Cilindrada", value: vehicle.engineCc },
    { label: "Distância entre eixos", value: vehicle.wheelbaseMm },
    { label: "Peso bruto", value: vehicle.grossWeightKg },
    { label: "Emissões de CO₂", value: vehicle.co2 },
  ];
}

export const IMT_HOMOLOGATION_URL = "https://chnac.imt-ip.pt/";
