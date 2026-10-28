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
import { categoriaPT, normalizarDataMatricula, normalizarFinalidade, numero, paisOrigemValido, tipoPT } from "@/lib/modelo9";
import { docTypeFrom } from "@/lib/registo";
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

const CAR_PHOTO_PROMPT = `És o assistente de um stand de automóveis em Portugal. Recebes FOTOGRAFIAS DO PRÓPRIO CARRO (não de documentos), tiradas no parque do stand. Identifica o carro para pré-preencher a ficha; a equipa confirma depois.

Responde APENAS com JSON: {"documentos":["foto_viatura"],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não tiveres a certeza — nunca inventes):
- marca: pelo emblema/logótipo e pela forma (ex.: "Peugeot", "BMW", "Porsche").
- modelo: pelo nome escrito na traseira ou pela forma inconfundível (ex.: "3008", "Leaf", "Cayenne", "Série 3 Coupé", "Tipo Station Wagon"). Se só tiveres palpite fraco, deixa "".
- versao: só se estiver escrita num emblema (ex.: "GT Line", "ST-Line", "e-HDi"); senão "".
- cor: em português, simples ("Preto", "Branco", "Cinzento", "Prateado", "Azul", "Vermelho", "Bege"…).
- matricula: exatamente como se lê na chapa (ex.: "77-81-TP", "BM-54-EF"); "" se não se vir ou estiver tapada. pais_matricula pela chapa (P = "Portugal", NL amarela = "Países Baixos", B vermelha = "Bélgica"…).
- combustivel: só se houver indicação visível (emblema "electric", "hybrid", tomada de carga, ausência de escape num elétrico conhecido como Leaf/Zoe → "Elétrico"); senão "".
- todos os outros campos: "".
- legivel: true se reconheces pelo menos marca e modelo; senão false e "problema" diz porquê ("só se vê a traseira desfocada").
- resumo: UMA linha, ex.: "Peugeot 206 cinzento, matrícula 77-81-TP".`;

/** Identifica o carro a partir de fotografias do próprio carro (marca, modelo, cor, matrícula). */
export async function readCarPhotos(parts: AiPart[]): Promise<VehicleProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos uma fotografia do carro.", 400);
  const json = await requestJson({ system: CAR_PHOTO_PROMPT, parts: [...parts, { text: "Identifica este carro." }], schema: VEHICLE_SCHEMA });
  return normalizeVehicleExtraction(json);
}

/* ───────────── Pessoa (ficha de cliente) ───────────── */

const PERSON_FIELDS = [
  "nome", "tipo_documento", "numero_documento", "validade_documento", "entidade_emissora", "nif",
  "data_nascimento", "nacionalidade", "morada", "codigo_postal", "localidade", "pais", "carta_conducao", "carta_emissao",
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
- carta_conducao: nº da carta de condução, se houver. carta_emissao: data de emissão da carta (campo 4a) em AAAA-MM-DD.
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
    postalCode: string; city: string; country: string; drivingLicenseNumber: string; drivingLicenseIssuedAt: string;
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
  const licenseIssued = normalizeDate(raw.carta_emissao);
  if (licenseIssued) fields.drivingLicenseIssuedAt = licenseIssued;
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

/* ───────────── Declarações avulsas ───────────── */

/**
 * Página Declarações: uma só caixa recebe o documento do cliente e o da viatura (DUA) misturados.
 * Lê com os dois leitores em paralelo e junta: "c.campo" = cliente, "v.campo" = viatura.
 */
export async function readDeclarationDocuments(parts: AiPart[]) {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const [person, vehicle] = await Promise.all([readPersonDocuments(parts), readVehicleDocuments(parts)]);
  const personFields = Object.entries(person.fields).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  const vehicleFields = Object.entries(vehicle.fields).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  const legible = person.legible || vehicle.legible;
  // Avisos só de quem encontrou alguma coisa (o leitor da viatura não se queixa de um Cartão de Cidadão).
  const warnings = [...(personFields.length ? person.warnings : []), ...(vehicleFields.length ? vehicle.warnings : [])];
  if (!personFields.length && !vehicleFields.length) warnings.push(...[person.problem, vehicle.problem].filter((p): p is string => Boolean(p)));
  return {
    documents: [...new Set([...person.documents, ...vehicle.documents])],
    legible,
    problem: legible ? null : person.problem ?? vehicle.problem,
    summary: [personFields.length ? person.summary : "", vehicleFields.length ? vehicle.summary : ""].filter(Boolean).join(". "),
    fields: Object.fromEntries([...personFields.map(([k, v]) => [`c.${k}`, v]), ...vehicleFields.map(([k, v]) => [`v.${k}`, v])]) as Record<string, string | number>,
    warnings: [...new Set(warnings)],
  };
}

/* ───────────── Importação (Modelo 9 e homologação) ───────────── */

const IMPORT_FIELDS = [
  "marca", "modelo", "versao", "variante", "vin", "matricula_origem", "data_primeira_matricula", "pais_origem",
  "homologacao", "categoria", "finalidade", "cor", "num_motor", "combustivel", "num_cilindros", "cilindrada",
  "distancia_eixos", "peso_bruto", "tara", "lotacao", "co2",
] as const;

const IMPORT_SCHEMA = {
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
      required: [...IMPORT_FIELDS],
      properties: Object.fromEntries(IMPORT_FIELDS.map((f) => [f, { type: "string" }])),
    },
  },
};

const IMPORT_PROMPT = `És o assistente de um stand de automóveis em Portugal que importa carros e os legaliza (Modelo 9 do IMT e homologação). Analisa as fotos/PDF dos documentos estrangeiros de UMA viatura. Cruza a informação de todos.

Documentos possíveis (códigos em "documentos"):
- "livrete_estrangeiro": certificado de matrícula estrangeiro, Parte I ou II. NL "Kentekenbewijs Deel I/II"; DE "Zulassungsbescheinigung Teil I/II"; FR "Certificat d'immatriculation"; "Registration Certificate"; ES "Permiso de circulación"; IT "Carta di circolazione".
- "coc": Certificado de Conformidade ("Certificate of Conformity", DE "Übereinstimmungsbescheinigung").
- "fatura": fatura ou declaração de compra.
- "outro".

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não constar; lê com atenção TODOS os campos — cada vazio tem de ser escrito à mão):
- marca (D.1); modelo (D.3 ou designação comercial); variante (D.2, a variante) e versao (D.2, a versão) — no CoC são "Variante"/"Versão".
- vin: nº de quadro (campo E), exatamente 17 caracteres, confirma letra a letra (sem O, I, Q).
- matricula_origem: a matrícula estrangeira tal como está (campo A).
- data_primeira_matricula: campo B (NL "Datum eerste toelating", DE "Datum der Erstzulassung"), em AAAA-MM-DD. Lê dia, mês e ano com cuidado.
- pais_origem: o país que EMITIU a matrícula estrangeira, em português ("Países Baixos", "Alemanha", "Bélgica", "França", "Itália", "Espanha", "Luxemburgo", "Suíça"…). NUNCA "Portugal". Pistas: idioma e brasão do documento; formato da matrícula (Países Baixos "99-XXX-9"/"XX-999-X", Alemanha "ABC-D 1234", Bélgica "1-ABC-234", França "AA-000-AA", Itália "AA 000 AA", Espanha "0000 ABC"). O país da marca ou do nº de homologação NÃO conta.
- homologacao: nº de homologação (campo K; CoC "e1*2007/46*…").
- categoria: categoria europeia (campo J): "M1", "N1"…
- finalidade: "Passageiros" (M1/M2/M3) ou "Mercadorias" (N1/N2/N3); sem campo J, pelo tipo escrito (NL "Personenauto", DE "Pkw" = Passageiros; NL "Bedrijfsauto"/"Bestelauto", DE "Lkw" = Mercadorias).
- cor (campo R), traduzida para português (NL "Zwart" = Preto, "Grijs" = Cinzento, "Wit" = Branco, "Blauw" = Azul, "Rood" = Vermelho).
- num_motor; combustivel (P.3): "Gasolina", "Gasóleo", "Elétrico", "Híbrido" ou "GPL"; num_cilindros; cilindrada em cm³ (P.1).
- distancia_eixos em mm; peso_bruto em kg (F.1; se não houver, F.2); tara em kg (G, massa em ordem de marcha); lotacao (S.1, nº de lugares); co2 em g/km (V.7). Só números.
- legivel: true só se VIN, matrícula e datas se leem por completo; senão "problema" diz exatamente onde ("o VIN está desfocado no livrete").
- resumo: UMA linha, ex.: "Kentekenbewijs NL de VW Golf, 99-XXX-9, 1.ª matrícula 2019 + CoC".`;

export interface FieldsProposal {
  documents: string[];
  legible: boolean;
  problem: string | null;
  summary: string;
  fields: Record<string, string>;
  warnings: string[];
}

function baseProposal(json: Record<string, unknown>, fields: Record<string, string>, warnings: string[]): FieldsProposal {
  const legible = json.legivel === true;
  const problem = str(json.problema).replace(/[.\s]+$/, "") || null;
  if (!legible && problem) warnings.unshift(problem);
  for (const [k, v] of Object.entries(fields)) if (!v) delete fields[k];
  return {
    documents: Array.isArray(json.documentos) ? json.documentos.map(str).filter(Boolean) : [],
    legible,
    problem: legible ? null : problem,
    summary: str(json.resumo),
    fields,
    warnings,
  };
}

export function normalizeImportExtraction(json: Record<string, unknown>): FieldsProposal {
  const d = (json.dados && typeof json.dados === "object" ? json.dados : {}) as Record<string, unknown>;
  const raw = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, str(d[f])])) as Record<(typeof IMPORT_FIELDS)[number], string>;
  const warnings: string[] = [];
  const num = (v: string) => {
    const n = numero(v);
    return n ? String(Math.round(n)) : "";
  };
  const vin = raw.vin ? normalizeVin(raw.vin) : "";
  if (vin && !isValidVinFormat(vin)) warnings.push(`O VIN lido (${vin}) não tem 17 caracteres válidos. Confirme no documento.`);
  const firstRegistration = normalizarDataMatricula(raw.data_primeira_matricula);
  if (raw.data_primeira_matricula && !firstRegistration) warnings.push(`A data da 1.ª matrícula (${raw.data_primeira_matricula}) não é válida. Confirme no campo B.`);
  const euCategory = raw.categoria.toUpperCase().replace(/\s/g, "");
  const fields: Record<string, string> = {
    make: raw.marca,
    model: raw.modelo,
    version: raw.versao,
    variant: raw.variante,
    vin,
    foreignPlate: raw.matricula_origem.toUpperCase(),
    firstRegistration,
    originCountry: paisOrigemValido(raw.pais_origem),
    homologation: raw.homologacao,
    euCategory,
    purpose: tipoPT({ purpose: normalizarFinalidade(raw.finalidade), euCategory }),
    color: raw.cor,
    engineNumber: raw.num_motor,
    fuel: raw.combustivel,
    cylinders: num(raw.num_cilindros),
    engineCc: num(raw.cilindrada),
    wheelbaseMm: num(raw.distancia_eixos),
    grossWeightKg: num(raw.peso_bruto),
    tareKg: num(raw.tara),
    seats: num(raw.lotacao),
    co2: num(raw.co2),
  };
  fields.category = categoriaPT({ grossWeightKg: fields.grossWeightKg, seats: fields.seats, euCategory });
  if (!fields.foreignPlate) warnings.push("Não veio a matrícula estrangeira (campo A).");
  if (!firstRegistration) warnings.push("Não veio a data da 1.ª matrícula (campo B).");
  return baseProposal(json, fields, warnings);
}

export async function readImportDocuments(parts: AiPart[]): Promise<FieldsProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: IMPORT_PROMPT, parts: [...parts, { text: "Extrai os dados para o Modelo 9 e a homologação." }], schema: IMPORT_SCHEMA });
  return normalizeImportExtraction(json);
}

/* ───────────── Requerente do Modelo 9 (empresa ou particular) ───────────── */

const REQUESTER_KEYS = [
  "tipo", "nome", "nif", "tipo_documento", "num_documento", "entidade_emissora", "validade_documento", "codigo_certidao", "morada", "codigo_postal", "localidade", "email", "telefone",
] as const;

const REQUESTER_SCHEMA = {
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
      required: [...REQUESTER_KEYS],
      properties: Object.fromEntries(REQUESTER_KEYS.map((f) => [f, { type: "string" }])),
    },
  },
};

const REQUESTER_PROMPT = `És o assistente de um stand de automóveis em Portugal. Vais preencher o REQUERENTE do Modelo 9 do IMT (em nome de quem o carro importado fica registado) a partir de fotos dos seus documentos. Junta a informação de todos.

Documentos possíveis (códigos em "documentos"):
- "certidao_permanente": certidão permanente do registo comercial de uma EMPRESA (tem "Código de acesso", NIPC, firma, sede).
- "cartao_empresa": cartão de pessoa coletiva / cartão da empresa (NIPC, firma, sede).
- "cartao_cidadao", "titulo_residencia", "passaporte", "bilhete_identidade": documento de uma pessoa.
- "comprovativo_morada": fatura ou outro documento com morada.
- "outro".

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não constar):
- tipo: "empresa" se o requerente é uma sociedade/empresa; "particular" se é uma pessoa.
- nome: firma completa da empresa (ex.: "Sucesso Prudente, Unipessoal Lda") ou nome completo da pessoa.
- nif: NIPC da empresa ou NIF da pessoa (9 algarismos).
- tipo_documento: SÓ particular — "Cartão de Cidadão", "Bilhete de Identidade", "Título de Residência", "Passaporte" ou o nome do documento.
- num_documento: SÓ particular — nº do documento de identificação (CC: nº de identificação civil, ex. "12345678 9 ZZ1").
- entidade_emissora: SÓ particular — quem emitiu o documento ("República Portuguesa" no CC português; "AIMA"/"SEF" no Título de Residência; o país no passaporte).
- validade_documento: SÓ particular — data de validade do documento em AAAA-MM-DD.
- codigo_certidao: SÓ empresa — o código de acesso à certidão permanente (formato "0000-0000-0000").
- morada (rua, número, andar), codigo_postal ("0000-000") e localidade: a SEDE da empresa ou a morada da pessoa em Portugal. Nunca inventes a morada a partir do local de nascimento; num passaporte ou documento estrangeiro sem morada em Portugal deixa "".
- email e telefone: só se estiverem escritos.
- legivel: true só se os dados principais se leem por completo; senão "problema" diz onde.
- resumo: UMA linha, ex.: "Certidão permanente de Sucesso Prudente, Unipessoal Lda".`;

export function normalizeRequesterExtraction(json: Record<string, unknown>): FieldsProposal {
  const d = (json.dados && typeof json.dados === "object" ? json.dados : {}) as Record<string, unknown>;
  const raw = Object.fromEntries(REQUESTER_KEYS.map((f) => [f, str(d[f])])) as Record<(typeof REQUESTER_KEYS)[number], string>;
  const warnings: string[] = [];
  const nif = raw.nif.replace(/\D/g, "");
  if (nif && !isValidNif(nif)) warnings.push(`O NIF lido (${raw.nif}) não passa na validação. Confirme no documento.`);
  const kind = raw.tipo.toLowerCase().startsWith("emp") ? "empresa" : raw.tipo ? "particular" : "";
  const doc = kind === "empresa" ? { docType: "", docTypeOther: "" } : docTypeFrom(raw.tipo_documento);
  const fields: Record<string, string> = {
    kind,
    name: raw.nome.replace(/\s+/g, " "),
    nif,
    docNumber: kind === "empresa" ? "" : raw.num_documento,
    docType: raw.tipo_documento ? doc.docType : "",
    docTypeOther: doc.docTypeOther,
    docIssuer: kind === "empresa" ? "" : raw.entidade_emissora,
    docExpiry: kind === "empresa" ? "" : normalizeDate(raw.validade_documento) ?? "",
    certCode: kind === "particular" ? "" : raw.codigo_certidao,
    address: raw.morada,
    postalCode: raw.codigo_postal ? formatPostalCodePt(raw.codigo_postal) : "",
    city: raw.localidade,
    email: raw.email.toLowerCase(),
    phone: raw.telefone,
  };
  if (!raw.morada) warnings.push("Nenhum documento tem a morada (sede). Escreva-a ou envie um comprovativo.");
  if (kind === "empresa" && !raw.codigo_certidao) warnings.push("Não veio o código da certidão permanente.");
  return baseProposal(json, fields, warnings);
}

export async function readRequesterDocuments(parts: AiPart[]): Promise<FieldsProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: REQUESTER_PROMPT, parts: [...parts, { text: "Extrai os dados do requerente." }], schema: REQUESTER_SCHEMA });
  return normalizeRequesterExtraction(json);
}

/* ───────────── Compra e venda: documentos de várias pessoas de uma vez ───────────── */

const PARTY_KEYS = [
  "tipo", "nome", "nif", "tipo_documento", "num_documento", "entidade_emissora", "validade_documento", "codigo_certidao", "morada", "codigo_postal", "localidade", "email",
] as const;

const PARTY_VEHICLE_KEYS = ["matricula", "marca", "modelo", "quadro", "proprietario"] as const;

const PARTIES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["documentos", "legivel", "problema", "resumo", "viatura", "pessoas"],
  properties: {
    documentos: { type: "array", items: { type: "string" } },
    legivel: { type: "boolean" },
    problema: { type: "string" },
    resumo: { type: "string" },
    viatura: {
      type: "object",
      additionalProperties: false,
      required: [...PARTY_VEHICLE_KEYS],
      properties: Object.fromEntries(PARTY_VEHICLE_KEYS.map((f) => [f, { type: "string" }])),
    },
    pessoas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...PARTY_KEYS],
        properties: Object.fromEntries(PARTY_KEYS.map((f) => [f, { type: "string" }])),
      },
    },
  },
};

const PARTIES_PROMPT = `És o assistente de um stand de automóveis em Portugal. Recebes fotos dos documentos de uma compra e venda de um carro: os documentos de identificação das pessoas (ou empresas) — normalmente o comprador e o vendedor, mas pode ser só um deles — e, muitas vezes, o documento do CARRO. Vais separar as PESSOAS, extrair os dados de cada uma e os dados do carro para o Requerimento de Registo Automóvel.

Documentos possíveis (códigos em "documentos"): "cartao_cidadao", "titulo_residencia", "passaporte", "bilhete_identidade", "carta_conducao", "certidao_permanente", "cartao_empresa", "comprovativo_morada", "documento_unico" (Documento Único Automóvel / DUA), "certificado_matricula", "livrete", "titulo_propriedade", "outro".

Documento do carro (DUA, Certificado de Matrícula, livrete ou título de registo de propriedade):
- NÃO é o documento de uma pessoa. Os dados vão para "viatura" e NUNCA crias uma entrada em "pessoas" a partir dele — nem com o nome ou a morada do proprietário que lá aparece.
- viatura.matricula: a matrícula (ex.: "AA-00-BB"; no Certificado de Matrícula é o campo A).
- viatura.marca: a marca (Certificado de Matrícula: D.1).
- viatura.modelo: o modelo / denominação comercial (Certificado de Matrícula: D.3), ex.: "330d", "Golf".
- viatura.quadro: o nº de quadro / VIN (17 caracteres; Certificado de Matrícula: E).
- viatura.proprietario: o nome do proprietário/titular inscrito no documento do carro.
- Sem documento do carro: todos os campos de "viatura" ficam "".

Regras das pessoas:
- Agrupa por pessoa: a frente e o verso do mesmo documento são da MESMA pessoa; um comprovativo de morada ou a carta de condução juntam-se à pessoa com o mesmo nome. NUNCA juntes duas pessoas diferentes numa só, nem dividas a mesma pessoa em duas.
- "pessoas": uma entrada por pessoa ou empresa, pela ordem em que aparecem nos ficheiros.
- Em cada pessoa ("" quando não constar):
  - tipo: "empresa" (sociedade) ou "particular".
  - nome: nome completo ou firma.
  - nif: NIF/NIPC (9 algarismos; no CC está no verso).
  - tipo_documento: "Cartão de Cidadão", "Bilhete de Identidade", "Título de Residência", "Passaporte" ou o nome do documento (particular).
  - num_documento: nº do documento de identificação (CC: nº de identificação civil, ex. "12345678 9 ZZ1"; Título de Residência: o nº do título).
  - entidade_emissora: quem emitiu ("República Portuguesa" no CC português; "AIMA"/"SEF" no Título de Residência; o país no passaporte).
  - validade_documento: data de validade em AAAA-MM-DD.
  - codigo_certidao: só empresa — código de acesso à certidão permanente.
  - morada, codigo_postal ("0000-000"), localidade: só de um documento que tenha a morada em Portugal (Título de Residência, comprovativo, certidão); nunca a partir do local de nascimento.
  - email: só se estiver escrito.
- legivel: true só se nomes, números e datas se leem bem; senão "problema" diz exatamente onde.
- resumo: UMA linha, ex.: "2 pessoas: Ana Silva (CC frente e verso) e João Costa (Título de Residência); carro AA-00-BB (DUA)".

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","viatura":{"matricula":"","marca":"","modelo":"","quadro":"","proprietario":""},"pessoas":[...]}`;

export interface PartiesProposal extends FieldsProposal {
  people: Record<string, string>[];
  /** Dados do documento do carro, quando veio junto (null se não veio). */
  vehicle: { plate: string; make: string; model: string; vin: string; owner: string } | null;
}

export function normalizePartiesExtraction(json: Record<string, unknown>): PartiesProposal {
  const list = Array.isArray(json.pessoas) ? (json.pessoas as Record<string, unknown>[]) : [];
  const warnings: string[] = [];
  const people = list
    .map((d) => {
      const one = normalizeRequesterExtraction({ legivel: true, dados: { ...d, telefone: "" } });
      warnings.push(...one.warnings.filter((w) => !/morada|certidão/i.test(w)));
      return one.fields;
    })
    .filter((p) => p.name || p.nif || p.docNumber);
  const v = (json.viatura ?? {}) as Record<string, unknown>;
  const vin = normalizeVin(str(v.quadro));
  const vehicle = { plate: formatPlate(str(v.matricula)), make: str(v.marca), model: str(v.modelo), vin, owner: str(v.proprietario) };
  if (vin && !isValidVinFormat(vin)) warnings.push("O nº de quadro do documento do carro não tem o formato habitual: confirme.");
  const base = baseProposal(json, {}, warnings);
  return { ...base, people, vehicle: vehicle.plate || vehicle.make || vehicle.model || vehicle.vin ? vehicle : null };
}

export async function readPartyDocuments(parts: AiPart[]): Promise<PartiesProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: PARTIES_PROMPT, parts: [...parts, { text: "Separa as pessoas e extrai os dados de cada uma." }], schema: PARTIES_SCHEMA });
  return normalizePartiesExtraction(json);
}

/* ───────────── Legalização: fatura de compra e CMR (Alfândega / DAV) ───────────── */

const CUSTOMS_FIELDS = [
  "vendedor_nome", "vendedor_morada", "vendedor_nif", "vendedor_tipo", "fatura_numero", "fatura_data", "preco", "moeda", "meio_pagamento", "km_fatura",
  "transportadora_nome", "transportadora_morada", "transportadora_nif", "data_entrega", "km_conta_quilometros",
] as const;

const fieldsSchema = (keys: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["documentos", "legivel", "problema", "resumo", "dados"],
  properties: {
    documentos: { type: "array", items: { type: "string" } },
    legivel: { type: "boolean" },
    problema: { type: "string" },
    resumo: { type: "string" },
    dados: { type: "object", additionalProperties: false, required: [...keys], properties: Object.fromEntries(keys.map((k) => [k, { type: "string" }])) },
  },
});

const CUSTOMS_PROMPT = `És o assistente de um despachante em Portugal que legaliza carros importados da Europa. Vais preencher a DAV (Declaração Aduaneira de Veículo) com os dados da COMPRA e do TRANSPORTE de UM carro. Recebes fotos/PDF de: fatura ou declaração de venda (pode estar em neerlandês, alemão, francês…), CMR (guia de transporte internacional) e, às vezes, uma foto do conta-quilómetros. Cruza a informação de todos.

Documentos possíveis (códigos em "documentos"): "fatura", "cmr", "conta_quilometros", "outro".

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não constar):
- vendedor_nome, vendedor_morada (sede completa, com país), vendedor_nif (nº de IVA/VAT, ex. "NL123456789B01", ou NIF): quem VENDE o carro (o emitente da fatura).
- vendedor_tipo: "1" se o vendedor é uma empresa/stand, "2" se é um particular.
- fatura_numero e fatura_data (AAAA-MM-DD) da fatura.
- preco: o valor total pago pelo carro, só o número com ponto decimal (ex.: "12500.00"). moeda: código ISO ("EUR", "CHF"…).
- meio_pagamento: "3" transferência, "1" numerário, "2" cheque, "4" outro — só se estiver escrito.
- km_fatura: quilómetros escritos na fatura (só o número).
- transportadora_nome, transportadora_morada, transportadora_nif: a empresa transportadora do CMR (casa 16 "Carrier/Vervoerder/Frachtführer").
- data_entrega: data de RECEÇÃO/entrega do carro no destino, no CMR (casa 24 "Goods received"), em AAAA-MM-DD.
- km_conta_quilometros: quilómetros na foto do conta-quilómetros (só o número).
- legivel: true se os dados principais se leem; senão "problema" diz o quê.
- resumo: UMA linha, ex.: "Fatura de AutoHaus GmbH de 12.500 € + CMR de Transportes X".`;

const isoOrEmpty = (v: string) => normalizeDate(v) ?? "";
const wholeNumber = (v: string) => {
  const n = parseNumber(v);
  return n !== null && n > 0 ? String(Math.round(n)) : "";
};

export function normalizeCustomsExtraction(json: Record<string, unknown>): FieldsProposal {
  const d = (json.dados && typeof json.dados === "object" ? json.dados : {}) as Record<string, unknown>;
  const raw = Object.fromEntries(CUSTOMS_FIELDS.map((k) => [k, str(d[k])])) as Record<(typeof CUSTOMS_FIELDS)[number], string>;
  const price = parseNumber(raw.preco);
  const fields: Record<string, string> = {
    sellerName: raw.vendedor_nome.replace(/\s+/g, " "),
    sellerAddress: raw.vendedor_morada,
    sellerNif: raw.vendedor_nif.replace(/\s/g, "").toUpperCase(),
    sellerKind: /^[123]$/.test(raw.vendedor_tipo) ? raw.vendedor_tipo : "",
    invoiceNumber: raw.fatura_numero,
    invoiceDate: isoOrEmpty(raw.fatura_data),
    purchasePrice: price && price > 0 ? price.toFixed(2) : "",
    currency: raw.moeda.toUpperCase().slice(0, 3),
    paymentMethod: /^[1-4]$/.test(raw.meio_pagamento) ? raw.meio_pagamento : "",
    kmAtSale: wholeNumber(raw.km_fatura),
    carrierName: raw.transportadora_nome.replace(/\s+/g, " "),
    carrierAddress: raw.transportadora_morada,
    carrierNif: raw.transportadora_nif.replace(/\s/g, "").toUpperCase(),
    entryDate: isoOrEmpty(raw.data_entrega),
    kmAtDav: wholeNumber(raw.km_conta_quilometros),
  };
  if (fields.carrierName) fields.entryType = "autotransportado";
  const warnings: string[] = [];
  if (!fields.invoiceNumber && !fields.purchasePrice) warnings.push("Não veio a fatura de compra (vendedor, nº, data e preço).");
  return baseProposal(json, fields, warnings);
}

export async function readCustomsDocuments(parts: AiPart[]): Promise<FieldsProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: CUSTOMS_PROMPT, parts: [...parts, { text: "Extrai os dados da compra e do transporte para a DAV." }], schema: fieldsSchema(CUSTOMS_FIELDS) });
  return normalizeCustomsExtraction(json);
}

/* ───────────── Legalização: comprovativo do registo inicial ───────────── */

const REGISTO_FIELDS = ["tipo", "matricula", "nome", "data", "marca", "modelo", "quadro", "num_documento"] as const;

const REGISTO_PROMPT = `És o assistente de um despachante de legalização de carros em Portugal. Analisa o(s) ficheiro(s) — fotos ou PDF — de um COMPROVATIVO DE REGISTO AUTOMÓVEL (registo inicial de propriedade). Pode vir em VÁRIAS páginas do MESMO registo; junta a informação de todas.

Há DOIS tipos (código em "dados.tipo"):
1. "conservatoria" — "Comprovativo de Apresentação" da Conservatória do Registo (cabeçalho do IRN / "Documento Único Automóvel"). Tem: Matrícula, Marca, "Apresentação nº X de <data>", "Facto registado: Reg. inicial de propriedade" e "TITULAR: <nome e morada>". O NOME é o do TITULAR.
2. "solicitador" — "Requerimento de Registo Automóvel" do Automóvel Online (automovelonline.mj.pt). Tem "Nº Pedido", "Data de Pedido", "Data de Venda/Facto", o veículo (Matrícula, Marca, Quadro nº) e dois sujeitos. O NOME é o do SUJEITO ATIVO (comprador), NUNCA o vendedor.
Também pode ser o próprio Certificado de Matrícula / DUA português: aí usa "conservatoria" e o titular.

Documentos possíveis (códigos em "documentos"): "registo_inicial", "dua", "outro".

Responde APENAS com JSON: {"documentos":[],"legivel":true,"problema":"","resumo":"","dados":{...}}

Regras para "dados" ("" quando não constar):
- tipo: "conservatoria" ou "solicitador".
- matricula: matrícula PORTUGUESA (ex.: "BZ-75-FN").
- nome: TITULAR (conservatória) ou COMPRADOR / sujeito ativo (solicitador), completo.
- data: data do registo em AAAA-MM-DD (conservatória: data da apresentação; solicitador: data de venda/facto ou, se não houver, data do pedido).
- marca, modelo, quadro (VIN).
- num_documento: nº de apresentação (conservatória) ou nº do pedido (solicitador).
- legivel: true só se matrícula, nome e data se leem bem; senão "problema" diz o quê.
- resumo: UMA linha, ex.: "Registo inicial na conservatória de BZ-75-FN em nome de Sucesso Prudente".`;

export function normalizeRegistoExtraction(json: Record<string, unknown>): FieldsProposal {
  const d = (json.dados && typeof json.dados === "object" ? json.dados : {}) as Record<string, unknown>;
  const raw = Object.fromEntries(REGISTO_FIELDS.map((k) => [k, str(d[k])])) as Record<(typeof REGISTO_FIELDS)[number], string>;
  const fields: Record<string, string> = {
    regType: raw.tipo === "solicitador" ? "solicitador" : raw.tipo === "conservatoria" ? "conservatoria" : "",
    ptPlate: raw.matricula ? formatPlate(raw.matricula) : "",
    holderName: raw.nome.replace(/\s+/g, " "),
    regDate: isoOrEmpty(raw.data),
    regNumber: raw.num_documento,
    make: raw.marca,
    model: raw.modelo,
    vin: raw.quadro ? normalizeVin(raw.quadro) : "",
  };
  const warnings: string[] = [];
  if (!fields.ptPlate) warnings.push("Não veio a matrícula portuguesa.");
  return baseProposal(json, fields, warnings);
}

export async function readRegistoDocuments(parts: AiPart[]): Promise<FieldsProposal> {
  if (!parts.length) throw new AiError("Envie pelo menos um ficheiro.", 400);
  const json = await requestJson({ system: REGISTO_PROMPT, parts: [...parts, { text: "Extrai os dados do registo inicial." }], schema: fieldsSchema(REGISTO_FIELDS) });
  return normalizeRegistoExtraction(json);
}
