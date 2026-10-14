/**
 * Leitura de documentos com IA: viaturas (DUA, livrete estrangeiro, CoC, fatura) e pessoas
 * (Cartão de Cidadão, título de residência, passaporte, carta de condução, comprovativo de morada).
 * Prompts adaptados do LegalCar (despachante) para um stand. O resultado é sempre uma PROPOSTA:
 * a pessoa revê e confirma antes de gravar; nada é escrito automaticamente sobre dados existentes.
 */
import "server-only";
import sharp from "sharp";
import {
  formatPlate,
  formatPostalCodePt,
  isValidNif,
  isValidVinFormat,
  normalizeDate,
  normalizeVin,
  parseNumber,
} from "@/lib/pt-validation";
import { AiError, requestJson, type AiPart } from "./provider";

export const MAX_AI_FILE_BYTES = 15 * 1024 * 1024;
const AI_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

/** Reduz fotografias grandes (o original é guardado intacto noutro lado). */
export async function prepareForAi(buffer: Buffer, mime: string): Promise<AiPart> {
  if (buffer.length > MAX_AI_FILE_BYTES) throw new AiError("Ficheiro demasiado grande (máx. 15 MB).", 413);
  if (mime === "application/pdf") return { base64: buffer.toString("base64"), mime };
  if (mime.startsWith("image/")) {
    if (buffer.length > 3.5 * 1024 * 1024 || !AI_MIME.includes(mime)) {
      const out = await sharp(buffer)
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      return { base64: out.toString("base64"), mime: "image/jpeg" };
    }
    return { base64: buffer.toString("base64"), mime };
  }
  throw new AiError("Formato não suportado. Envie uma fotografia ou um PDF.", 400);
}

/* ───────────── Viatura ───────────── */

const VEHICLE_FIELDS = [
  "marca", "modelo", "versao", "ano", "matricula", "pais_matricula", "vin", "cor", "combustivel",
  "cilindrada", "potencia_kw", "potencia_cv", "lotacao", "portas", "peso_bruto", "tara", "co2",
  "categoria", "tipo_veiculo", "homologacao", "data_primeira_matricula", "data_matricula_pt",
  "titular_nome", "titular_morada", "km", "proxima_inspecao", "preco_compra", "vendedor_nome",
  "vendedor_nif", "data_compra",
] as const;
export type VehicleExtraction = Record<(typeof VEHICLE_FIELDS)[number], string>;

const VEHICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentos", "legivel", "problema", "resumo", "dados"],
  properties: {
    documentos: { type: "array", items: { type: "string" } },
    legivel: { type: "boolean" },
    problema: { type: "string" },
    resumo: { type: "string" },
    dados: {
      type: "object",
      additionalProperties: false,
      required: [...VEHICLE_FIELDS],
      properties: Object.fromEntries(VEHICLE_FIELDS.map((f) => [f, { type: "string" }])),
    },
  },
};

const VEHICLE_PROMPT = `És o assistente de um stand de automóveis em Portugal. Analisa os ficheiros (fotos ou PDF) de documentos de UMA viatura que deu entrada no stand. Cruza a informação de todos.

Documentos possíveis (usa estes códigos em "documentos"):
- "dua": Documento Único Automóvel / Certificado de Matrícula português (cartão com campos A, B, C.1, D.1, E…).
- "livrete_estrangeiro": certificado de matrícula estrangeiro — NL "Kentekenbewijs", DE "Zulassungsbescheinigung Teil I/II", FR "Certificat d'immatriculation", ES "Permiso de circulación".
- "coc": Certificado de Conformidade ("Certificate of Conformity", DE "Übereinstimmungsbescheinigung").
- "fatura": fatura ou declaração de compra da viatura.
- "inspecao": ficha de inspeção periódica (IPO).
- "registo": requerimento ou comprovativo de registo automóvel (IRN / Automóvel Online).
- "outro": qualquer outro documento.

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não constar):
- marca (campo D.1), modelo (D.3 ou designação comercial), versao (versão/variante, D.2).
- ano: 4 dígitos, ano da 1.ª matrícula.
- matricula: matrícula atual tal como escrita (campo A). pais_matricula: país emissor em português ("Portugal", "Alemanha", "Países Baixos"…), pelo idioma/brasão do documento e formato da matrícula.
- vin: número de quadro/chassi (campo E), exatamente 17 caracteres, confirma letra a letra (sem I, O, Q).
- cor (campo R, em português). combustivel: "Gasolina", "Gasóleo", "Elétrico", "Híbrido", "Híbrido plug-in" ou "GPL" (campo P.3).
- cilindrada em cm³ (P.1), potencia_kw (P.2, só número), potencia_cv se estiver escrita, lotacao (S.1), portas, peso_bruto (F.1, kg), tara (G, kg), co2 (V.7, g/km) — só números.
- categoria (campo J: "M1", "N1"…), tipo_veiculo ("Ligeiro de passageiros", "Ligeiro de mercadorias"…), homologacao (campo K ou nº CE do CoC).
- data_primeira_matricula (campo B) e data_matricula_pt (data da matrícula em Portugal, se diferente) em AAAA-MM-DD.
- titular_nome / titular_morada: proprietário registado (campo C.1) quando constar.
- km: quilometragem se constar num documento (ex.: fatura, inspeção). proxima_inspecao: data AAAA-MM-DD da próxima IPO.
- preco_compra (só número, ponto decimal), vendedor_nome, vendedor_nif, data_compra (AAAA-MM-DD): só se houver fatura/declaração de compra.
- legivel: true só se os dados importantes (matrícula, VIN, datas) se leem por completo; senão "problema" diz exatamente onde ("o VIN está desfocado").
- resumo: UMA linha para a equipa, ex.: "DUA de BMW 320d, AA-12-BB, 1.ª matrícula 2019".`;

const KW_TO_CV = 1.35962;

export interface VehicleProposal {
  documents: string[];
  legible: boolean;
  problem: string | null;
  summary: string;
  raw: VehicleExtraction;
  /** Campos já no formato da tabela vehicles. */
  fields: Partial<{
    make: string; model: string; version: string; year: number; plate: string; vin: string; color: string;
    fuel: "petrol" | "diesel" | "hybrid" | "electric"; engineCc: number; powerHp: number; seats: number;
    doors: number; grossWeightKg: number; tareKg: number; co2: number; vehicleType: string; homologation: string;
    firstRegistration: string; registrationDate: string; registrationOwner: string; mileageKm: number;
    nextInspection: string; purchasePriceEur: number; supplier: string; purchaseDate: string;
  }>;
  warnings: string[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

export function mapFuel(value: string): "petrol" | "diesel" | "hybrid" | "electric" | undefined {
  const s = value.toLowerCase();
  if (!s) return undefined;
  if (/h[ií]brid|hybrid|phev|plug/.test(s)) return "hybrid";
  if (/el[eé]tri|electric|elektr|bev/.test(s)) return "electric";
  if (/gas[oó]leo|diesel/.test(s)) return "diesel";
  if (/gasolina|petrol|benzin|gasoline|essence/.test(s)) return "petrol";
  return undefined;
}

export function normalizeVehicleExtraction(json: Record<string, unknown>): VehicleProposal {
  const d = (json.dados && typeof json.dados === "object" ? json.dados : {}) as Record<string, unknown>;
  const raw = Object.fromEntries(VEHICLE_FIELDS.map((f) => [f, str(d[f])])) as VehicleExtraction;
  const warnings: string[] = [];
  const fields: VehicleProposal["fields"] = {};
  const int = (v: string) => {
    const n = parseNumber(v);
    return n !== null && n > 0 ? Math.round(n) : undefined;
  };

  if (raw.marca) fields.make = raw.marca;
  if (raw.modelo) fields.model = raw.modelo;
  if (raw.versao) fields.version = raw.versao;
  const firstReg = normalizeDate(raw.data_primeira_matricula);
  if (firstReg) fields.firstRegistration = firstReg;
  const year = int(raw.ano) ?? (firstReg ? Number(firstReg.slice(0, 4)) : undefined);
  if (year && year >= 1900 && year <= new Date().getUTCFullYear() + 1) fields.year = year;
  if (raw.matricula) fields.plate = formatPlate(raw.matricula);
  if (raw.vin) {
    const vin = normalizeVin(raw.vin);
    fields.vin = vin;
    if (!isValidVinFormat(vin)) warnings.push(`O VIN lido (${vin}) não tem o formato de 17 caracteres. Confirme no documento.`);
  }
  if (raw.cor) fields.color = raw.cor;
  const fuel = mapFuel(raw.combustivel);
  if (fuel) fields.fuel = fuel;
  const cc = int(raw.cilindrada);
  if (cc) fields.engineCc = cc;
  const cv = int(raw.potencia_cv) ?? (int(raw.potencia_kw) ? Math.round(int(raw.potencia_kw)! * KW_TO_CV) : undefined);
  if (cv) fields.powerHp = cv;
  const seats = int(raw.lotacao);
  if (seats) fields.seats = seats;
  const doors = int(raw.portas);
  if (doors) fields.doors = doors;
  const gross = int(raw.peso_bruto);
  if (gross) fields.grossWeightKg = gross;
  const tare = int(raw.tara);
  if (tare) fields.tareKg = tare;
  const co2 = int(raw.co2);
  if (co2) fields.co2 = co2;
  if (raw.tipo_veiculo || raw.categoria)
    fields.vehicleType = [raw.tipo_veiculo, raw.categoria].filter(Boolean).join(" · ");
  if (raw.homologacao) fields.homologation = raw.homologacao;
  const ptReg = normalizeDate(raw.data_matricula_pt);
  if (ptReg) fields.registrationDate = ptReg;
  if (raw.titular_nome) fields.registrationOwner = raw.titular_nome;
  const km = int(raw.km);
  if (km) fields.mileageKm = km;
  const ipo = normalizeDate(raw.proxima_inspecao);
  if (ipo) fields.nextInspection = ipo;
  const price = parseNumber(raw.preco_compra);
  if (price && price > 0) fields.purchasePriceEur = price;
  if (raw.vendedor_nome) fields.supplier = raw.vendedor_nif ? `${raw.vendedor_nome} (NIF ${raw.vendedor_nif})` : raw.vendedor_nome;
  const bought = normalizeDate(raw.data_compra);
  if (bought) fields.purchaseDate = bought;
  if (raw.vendedor_nif && !isValidNif(raw.vendedor_nif))
    warnings.push(`O NIF do vendedor (${raw.vendedor_nif}) não passa na validação. Confirme no documento.`);

  const legible = json.legivel === true;
  const problem = str(json.problema).replace(/[.\s]+$/, "") || null;
  if (!legible && problem) warnings.unshift(problem);
  return {
    documents: Array.isArray(json.documentos) ? json.documentos.map(str).filter(Boolean) : [],
    legible,
    problem: legible ? null : problem,
    summary: str(json.resumo),
    raw,
    fields,
    warnings,
  };
}

export async function readVehicleDocuments(parts: AiPart[]): Promise<VehicleProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: VEHICLE_PROMPT, parts: [...parts, { text: "Extrai os dados destes documentos." }], schema: VEHICLE_SCHEMA });
  return normalizeVehicleExtraction(json);
}

/* ───────────── Pessoa (ficha de cliente) ───────────── */

const PERSON_FIELDS = [
  "nome", "tipo_documento", "numero_documento", "validade_documento", "entidade_emissora", "nif",
  "data_nascimento", "nacionalidade", "morada", "codigo_postal", "localidade", "pais", "carta_conducao",
  "niss", "sexo",
] as const;
export type PersonExtraction = Record<(typeof PERSON_FIELDS)[number], string>;

const PERSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentos", "legivel", "problema", "resumo", "dados"],
  properties: {
    documentos: { type: "array", items: { type: "string" } },
    legivel: { type: "boolean" },
    problema: { type: "string" },
    resumo: { type: "string" },
    dados: {
      type: "object",
      additionalProperties: false,
      required: [...PERSON_FIELDS],
      properties: Object.fromEntries(PERSON_FIELDS.map((f) => [f, { type: "string" }])),
    },
  },
};

const PERSON_PROMPT = `És o assistente de um stand de automóveis em Portugal. Vais preencher a ficha de um cliente a partir de fotos (frente e verso) dos seus documentos pessoais. Junta a informação de todos os ficheiros.

Documentos possíveis (códigos em "documentos"):
- "cartao_cidadao": Cartão de Cidadão português (frente: nome, nº de identificação civil, validade, nascimento; verso: NIF, NISS, nº de utente; a morada NÃO está impressa no CC).
- "titulo_residencia": Título / Autorização de Residência (o verso tem a morada em Portugal).
- "passaporte": passaporte (sem morada utilizável).
- "bilhete_identidade": documento de identidade estrangeiro (ex.: DNI espanhol, carte d'identité, RG brasileiro).
- "carta_conducao": carta de condução (nº da carta no campo 5).
- "comprovativo_morada": fatura de luz/água/telecomunicações, declaração das Finanças ou outro documento com a morada.
- "outro".

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não constar):
- nome: nome completo (nomes próprios + apelidos, pela ordem natural "Nome Apelido").
- tipo_documento: "Cartão de Cidadão", "Título de Residência", "Passaporte", "Bilhete de Identidade" ou "Outro" — o documento de identificação principal.
- numero_documento: nº do documento de identificação (CC: nº de identificação civil com os dígitos de controlo, ex. "12345678 9 ZZ1").
- validade_documento e data_nascimento em AAAA-MM-DD. entidade_emissora: país ou entidade que emitiu.
- nif: número de identificação fiscal português (9 algarismos), se constar. niss: se constar. sexo: "M" ou "F".
- nacionalidade em português ("Portuguesa", "Brasileira"…).
- MORADA: preenche morada (rua, número, andar), codigo_postal ("0000-000"), localidade e pais SÓ a partir de um documento que tenha a morada (título de residência, comprovativo de morada, carta de condução com morada). Nunca inventes morada a partir do local de nascimento.
- carta_conducao: nº da carta de condução, se houver.
- legivel: true só se os dados principais se leem por completo; senão "problema" diz exatamente onde.
- resumo: UMA linha para a equipa, ex.: "CC de Ana Silva (frente e verso) + fatura da EDP com morada".`;

export interface PersonProposal {
  documents: string[];
  legible: boolean;
  problem: string | null;
  summary: string;
  raw: PersonExtraction;
  fields: Partial<{
    fullName: string; idDocumentType: string; idDocumentNumber: string; idDocumentExpiry: string;
    idDocumentIssuer: string; nif: string; birthDate: string; nationality: string; address: string;
    postalCode: string; city: string; country: string; drivingLicenseNumber: string;
  }>;
  warnings: string[];
}

export function normalizePersonExtraction(json: Record<string, unknown>): PersonProposal {
  const d = (json.dados && typeof json.dados === "object" ? json.dados : {}) as Record<string, unknown>;
  const raw = Object.fromEntries(PERSON_FIELDS.map((f) => [f, str(d[f])])) as PersonExtraction;
  const fields: PersonProposal["fields"] = {};
  const warnings: string[] = [];
  if (raw.nome) fields.fullName = raw.nome.replace(/\s+/g, " ");
  if (raw.tipo_documento) fields.idDocumentType = raw.tipo_documento;
  if (raw.numero_documento) fields.idDocumentNumber = raw.numero_documento;
  const expiry = normalizeDate(raw.validade_documento);
  if (expiry) {
    fields.idDocumentExpiry = expiry;
    if (expiry < new Date().toISOString().slice(0, 10)) warnings.push(`O documento de identificação está caducado (${expiry}).`);
  }
  if (raw.entidade_emissora) fields.idDocumentIssuer = raw.entidade_emissora;
  if (raw.nif) {
    const nif = raw.nif.replace(/\D/g, "");
    fields.nif = nif;
    if (!isValidNif(nif)) warnings.push(`O NIF lido (${raw.nif}) não passa na validação. Confirme no documento.`);
  }
  const birth = normalizeDate(raw.data_nascimento);
  if (birth) fields.birthDate = birth;
  if (raw.nacionalidade) fields.nationality = raw.nacionalidade;
  if (raw.morada) fields.address = raw.morada;
  if (raw.codigo_postal) fields.postalCode = formatPostalCodePt(raw.codigo_postal);
  if (raw.localidade) fields.city = raw.localidade;
  if (raw.pais) fields.country = raw.pais;
  else if (raw.morada && /^\d{4}-\d{3}$/.test(fields.postalCode ?? "")) fields.country = "Portugal";
  if (raw.carta_conducao) fields.drivingLicenseNumber = raw.carta_conducao;
  if (!raw.morada) warnings.push("Nenhum documento enviado tem morada. Peça o título de residência ou um comprovativo de morada.");

  const legible = json.legivel === true;
  const problem = str(json.problema).replace(/[.\s]+$/, "") || null;
  if (!legible && problem) warnings.unshift(problem);
  return {
    documents: Array.isArray(json.documentos) ? json.documentos.map(str).filter(Boolean) : [],
    legible,
    problem: legible ? null : problem,
    summary: str(json.resumo),
    raw,
    fields,
    warnings,
  };
}

export async function readPersonDocuments(parts: AiPart[]): Promise<PersonProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: PERSON_PROMPT, parts: [...parts, { text: "Extrai os dados para a ficha de cliente." }], schema: PERSON_SCHEMA });
  return normalizePersonExtraction(json);
}
