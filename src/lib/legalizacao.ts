/**
 * Legalização de carros importados, em 3 etapas — Modelo 9 e homologação → Alfândega (DAV) → Registo inicial.
 * Partilhado entre o painel e o servidor.
 *
 * As casas da DAV e os códigos vêm do LegalCar (DAV-CAMPOS.md), que segue as instruções oficiais da AT:
 * Ofício-circulado n.º 35.083, de 21/12/2017 ("Instruções de preenchimento da DAV — SFA2"), e o
 * Manual de Procedimentos Simplificado do ISV (ponto 6.2, tipo de veículo fiscal).
 * Listas que só existem dentro do portal (alfândegas, cores, carroçarias) ficam como texto a escolher lá.
 */
import { categoriaPT, normalizarDataMatricula, numero, paisOrigemValido, tipoPT, type Modelo9Requester, type Modelo9Vehicle } from "./modelo9";

/* ───────────── Etapas ───────────── */

export const STAGES = ["modelo9", "alfandega", "registo", "concluido"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  modelo9: "Modelo 9 e homologação",
  alfandega: "Alfândega (DAV)",
  registo: "Registo inicial",
  concluido: "Concluído",
};
export const STAGE_SHORT: Record<Stage, string> = { modelo9: "Modelo 9", alfandega: "Alfândega", registo: "Registo inicial", concluido: "Concluído" };
export const STAGE_PILL: Record<Stage, string> = { modelo9: "preparation", alfandega: "reserved", registo: "accent", concluido: "available" };
export const stageIndex = (s: Stage) => STAGES.indexOf(s);
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);

/* ───────────── Prazos ───────────── */

/** A DAV tem de ser submetida até 20 dias úteis depois da entrada do carro em Portugal. */
export const DAV_WORKING_DAYS = 20;
/** Registo de propriedade: 60 dias. */
export const REGISTO_DAYS = 60;

const isoDay = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const weekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });

/** Soma dias úteis (segunda a sexta; os feriados não são descontados). */
export function addWorkingDays(iso: string, n: number): string {
  const d = isoDay(iso);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (weekday(d)) left--;
  }
  return toIso(d);
}

/** Dias úteis de `from` (exclusive) até `to` (inclusive); negativo se `to` já passou. */
export function workingDaysUntil(to: string, from: string): number {
  if (to === from) return 0;
  const step = to > from ? 1 : -1;
  const d = isoDay(from);
  let count = 0;
  while (toIso(d) !== to) {
    d.setUTCDate(d.getUTCDate() + step);
    if (weekday(d)) count += step;
  }
  return count;
}

export function addDays(iso: string, n: number): string {
  const d = isoDay(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

const validIso = (v: string | null | undefined): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");

export type DavDeadline =
  | { state: "sem_data" }
  | { state: "submetida"; deadline: string }
  | { state: "ok" | "atencao" | "atrasado"; deadline: string; daysLeft: number };

/** Prazo da DAV: conta até a DAV ser submetida (nº da DAV preenchido ou etapa depois da Alfândega). */
export function davDeadline(entryDate: string | null | undefined, stage: Stage, submitted: boolean, today = todayIso()): DavDeadline {
  if (!validIso(entryDate)) return { state: "sem_data" };
  const deadline = addWorkingDays(entryDate, DAV_WORKING_DAYS);
  if (submitted || stageIndex(stage) > stageIndex("alfandega")) return { state: "submetida", deadline };
  const daysLeft = workingDaysUntil(deadline, today);
  return { state: daysLeft < 0 ? "atrasado" : daysLeft <= 3 ? "atencao" : "ok", deadline, daysLeft };
}

export function deadlineText(d: DavDeadline): string {
  const br = (iso: string) => iso.split("-").reverse().join("/");
  if (d.state === "sem_data") return "Sem data de entrada";
  if (d.state === "submetida") return "DAV submetida";
  if (d.state === "atrasado") return `DAV atrasada ${-d.daysLeft} dia${d.daysLeft === -1 ? "" : "s"} úteis (prazo ${br(d.deadline)})`;
  return `DAV até ${br(d.deadline)} · faltam ${d.daysLeft} dia${d.daysLeft === 1 ? "" : "s"} úteis`;
}
export const DEADLINE_PILL: Record<DavDeadline["state"], string> = { sem_data: "neutral", submetida: "available", ok: "plain", atencao: "reserved", atrasado: "danger" };

/* ───────────── Clientes da legalização ───────────── */

export interface LegalClientData {
  kind: "empresa" | "particular";
  name: string;
  nif: string;
  docNumber: string;
  certCode: string;
  address: string;
  postalCode: string;
  city: string;
  email: string;
  phone: string;
  notes: string;
}
export const emptyClient = (kind: LegalClientData["kind"] = "empresa"): LegalClientData => ({
  kind, name: "", nif: "", docNumber: "", certCode: "", address: "", postalCode: "", city: "", email: "", phone: "", notes: "",
});
/** O requerente do Modelo 9 é sempre o cliente do processo. */
export function clientToRequester(c: Partial<LegalClientData>): Modelo9Requester {
  return {
    kind: c.kind === "particular" ? "particular" : "empresa",
    name: c.name ?? "", nif: c.nif ?? "", docNumber: c.docNumber ?? "", certCode: c.certCode ?? "",
    address: c.address ?? "", postalCode: c.postalCode ?? "", city: c.city ?? "", email: c.email ?? "", phone: c.phone ?? "",
  };
}

/* ───────────── Alfândega (DAV): o que se escreve no painel ───────────── */

export type Option = [code: string, label: string];
export type CustomsField = { key: string; label: string; casa?: string; type?: "date" | "select" | "number"; options?: Option[]; hint?: string; wide?: boolean };

const TAXPAYER: Option[] = [["1", "1 — Operador registado"], ["2", "2 — Operador reconhecido"], ["3", "3 — Sem estatuto / Particular"]];
const REPRESENTATION: Option[] = [["1", "1 — Dono"], ["2", "2 — Representante indireto"], ["3", "3 — Ocasional (máx. 3 por ano)"], ["4", "4 — Representante direto"]];
const SELLER_KIND: Option[] = [["1", "1 — Empresa"], ["2", "2 — Particular"], ["3", "3 — Outras"]];
const BUYER_VAT: Option[] = [["1", "1 — Normal"], ["2", "2 — Isenção (art. 53.º)"], ["3", "3 — Isento (art. 9.º)"], ["4", "4 — Outros"]];
const VAT_REGIME: Option[] = [["1", "1 — Isenta (intracomunitária)"], ["2", "2 — Bens em 2.ª mão"], ["3", "3 — Outros"]];
const PAYMENT: Option[] = [["1", "1 — Numerário"], ["2", "2 — Cheque"], ["3", "3 — Transferência"], ["4", "4 — Outros"]];
const TRANSPORT: Option[] = [["1", "1 — Pelos próprios meios"], ["2", "2 — Via rodoviária"], ["3", "3 — Via marítima"], ["4", "4 — Outros"]];
const ENTRY: Option[] = [["autotransportado", "Autotransportado (camião/cegonha)"], ["proprios", "Pelos próprios meios"]];
const GEARBOX: Option[] = [["01", "01 — Manual"], ["02", "02 — Automática"], ["03", "03 — Especial"], ["04", "04 — Semiautomática"], ["05", "05 — Automatizada"], ["06", "06 — CVT"]];
const PAY_MODE: Option[] = [["prazo", "Pagamento a 10 dias úteis"], ["T", "T — Garantia (fiança do despachante)"]];
const CO2_CYCLE: Option[] = [["WLTP", "WLTP"], ["NEDC", "NEDC"]];
const YES_NO: Option[] = [["nao", "Não"], ["sim", "Sim"]];
const DEAL_SOURCE: Option[] = [["1", "1 — Internet"], ["2", "2 — Deslocação"], ["3", "3 — Intermediário"], ["4", "4 — Outras"]];

export const CUSTOMS_GROUPS: { title: string; hint?: string; fields: CustomsField[] }[] = [
  {
    title: "Entrada em Portugal",
    hint: "A data de entrada conta o prazo de 20 dias úteis para submeter a DAV. Carro transportado: data de receção no CMR.",
    fields: [
      { key: "entryType", label: "Tipo de entrada", casa: "66a", type: "select", options: ENTRY },
      { key: "transportMeans", label: "Meio de transporte até Portugal", casa: "DC21", type: "select", options: TRANSPORT },
      { key: "kmAtDav", label: "Quilómetros à data da DAV", casa: "57", type: "number", hint: "Conta-quilómetros" },
      { key: "previousPlateDate", label: "Data da matrícula atual (livrete, campo I)", casa: "62", type: "date" },
    ],
  },
  {
    title: "Fatura de compra (vendedor)",
    fields: [
      { key: "sellerName", label: "Vendedor — nome", casa: "DC01", wide: true },
      { key: "sellerAddress", label: "Vendedor — sede / morada", casa: "DC02", wide: true },
      { key: "sellerNif", label: "Vendedor — NIF / nº de IVA", casa: "DC03" },
      { key: "sellerKind", label: "Vendedor — qualidade", casa: "DC04", type: "select", options: SELLER_KIND },
      { key: "invoiceNumber", label: "Nº da fatura", casa: "DC10" },
      { key: "invoiceDate", label: "Data da fatura (venda)", casa: "DC11", type: "date" },
      { key: "purchasePrice", label: "Preço de compra", casa: "DC13", type: "number" },
      { key: "currency", label: "Moeda", casa: "DC14", hint: "EUR se ficar vazio" },
      { key: "paymentMethod", label: "Meio de pagamento", casa: "DC15", type: "select", options: PAYMENT },
      { key: "kmAtSale", label: "Quilómetros na fatura", casa: "76", type: "number" },
      { key: "vatRegime", label: "Regime de IVA da fatura", casa: "DC12", type: "select", options: VAT_REGIME },
      { key: "intermediary", label: "Houve intermediário?", casa: "DC16", type: "select", options: YES_NO },
      { key: "intermediaryName", label: "Intermediário — nome e NIF", casa: "DC17", wide: true, hint: "Só se houve" },
      { key: "dealSource", label: "Como soube do negócio", casa: "DC26", type: "select", options: DEAL_SOURCE },
      { key: "dealSite", label: "Site do anúncio", casa: "DC27", hint: "Se foi pela internet" },
    ],
  },
  {
    title: "Transportadora (CMR)",
    fields: [
      { key: "carrierName", label: "Transportadora — nome", casa: "DC22", wide: true },
      { key: "carrierAddress", label: "Transportadora — sede", casa: "DC23", wide: true },
      { key: "carrierNif", label: "Transportadora — NIF / nº de IVA", casa: "DC24" },
    ],
  },
  {
    title: "Dados técnicos do CoC",
    hint: "Não vêm no livrete: leem-se no Certificado de Conformidade.",
    fields: [
      { key: "gearbox", label: "Caixa de velocidades", casa: "53", type: "select", options: GEARBOX },
      { key: "co2Cycle", label: "Ciclo do CO₂", casa: "50", type: "select", options: CO2_CYCLE, hint: "O que está no CoC" },
      { key: "driveAxles", label: "Nº de eixos motores", casa: "46", type: "number" },
      { key: "bodyType", label: "Tipo de caixa (carroçaria)", casa: "41", hint: "Escolher na lista do portal" },
      { key: "particles", label: "Partículas (g/km)", casa: "51", hint: "Só gasóleo" },
      { key: "batteryRange", label: "Autonomia elétrica (km)", casa: "52", type: "number", hint: "Só híbridos plug-in" },
    ],
  },
  {
    title: "Opções do escritório",
    fields: [
      { key: "customsOffice", label: "Alfândega", casa: "01", hint: "Regime geral: qualquer alfândega" },
      { key: "taxpayerStatus", label: "Estatuto do sujeito passivo", casa: "02", type: "select", options: TAXPAYER },
      { key: "representation", label: "Qualidade de representação", casa: "14", type: "select", options: REPRESENTATION },
      { key: "buyerVat", label: "Enquadramento de IVA do comprador", casa: "DC09", type: "select", options: BUYER_VAT },
      { key: "paymentMode", label: "Modo de pagamento do ISV", casa: "84", type: "select", options: PAY_MODE },
      { key: "imtService", label: "Serviço do IMT que emite a matrícula", casa: "89", hint: "Escolher na lista do portal" },
    ],
  },
  {
    title: "Depois de submeter",
    hint: "O ISV paga-se até 10 dias úteis depois da liquidação. O original do livrete estrangeiro entrega-se no IMT até 10 dias depois da DAV.",
    fields: [
      { key: "davNumber", label: "Nº da DAV (com a versão)" },
      { key: "davSubmittedAt", label: "Aceite em", type: "date" },
      { key: "isvEur", label: "ISV liquidado (€)", type: "number" },
      { key: "ducNumber", label: "Referência de pagamento (DUC)" },
      { key: "isvDueDate", label: "Pagar até", type: "date" },
      { key: "isvPaidAt", label: "ISV pago em", type: "date" },
      { key: "foreignCertDepositAt", label: "Livrete estrangeiro entregue no IMT em", type: "date" },
    ],
  },
];
export const CUSTOMS_KEYS = CUSTOMS_GROUPS.flatMap((g) => g.fields.map((f) => f.key));

const optionLabel = (options: Option[], code: string | undefined) => options.find(([c]) => c === code)?.[1] ?? "";

/* ───────────── Alfândega (DAV): o valor de cada casa, pela ordem do portal ───────────── */

export interface DavField {
  casa: string;
  label: string;
  /** O que se escreve/escolhe no portal ("" = falta). */
  value: string;
  /** O que o botão "Copiar" copia (o código, nas listas). */
  copy: string;
  hint?: string;
  required?: boolean;
}
export interface DavSection {
  title: string;
  fields: DavField[];
}

/** NIF de empresa (pessoa coletiva): começa por 5, 6 ou 9. */
export const nifDeEmpresa = (nif: string | null | undefined) => /^[569]\d{8}$/.test((nif ?? "").replace(/\s/g, ""));

const isElectric = (fuel: string) => /el[eé]tric|electric/i.test(fuel) && !/h[ií]brid|plug|gasolina|gas[oó]leo|diesel/i.test(fuel);
const isDiesel = (fuel: string) => /gas[oó]leo|diesel/i.test(fuel);
const isPlugIn = (fuel: string) => /plug|el[eé]trico\s*\//i.test(fuel);

/** Combustível → código da DAV quando a AT o publica (02, 14, 15); senão o texto para escolher. */
export function combustivelDav(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const t = s.toLowerCase();
  if (!t) return "";
  if (/plug|el[ée]trico\s*\/\s*gas[óo]leo/.test(t) && /gas[óo]leo|diesel/.test(t)) return "15 — Elétrico/gasóleo";
  if (/plug|el[ée]trico\s*\/\s*gasolina/.test(t)) return "14 — Elétrico/gasolina";
  if (/gas[óo]leo|diesel/.test(t)) return "02 — Gasóleo";
  return s;
}

/** Tipo de veículo fiscal (casa 33), Manual do ISV ponto 6.2. */
function tipoFiscal(v: Modelo9Vehicle): { value: string; hint?: string } {
  const c = v.category || categoriaPT(v);
  const t = tipoPT(v);
  if (c === "Ligeiro" && t === "Passageiros") return { value: "001 — Ligeiro de passageiros" };
  if (c === "Pesado" && t === "Passageiros") return { value: "01A — Passageiros com mais de 3500 kg (até 9 lugares)", hint: "Confirmar" };
  if (t === "Mercadorias") return { value: "077 — Ligeiro de mercadorias", hint: "Confirmar: mistos 004/04A/04B; caixa aberta 0M2–0M6" };
  return { value: "", hint: "Falta saber se é passageiros ou mercadorias (Modelo 9)" };
}

const code = (value: string) => value.split(" — ")[0].trim();
const br = (iso: string) => (validIso(iso) ? iso.split("-").reverse().join("/") : iso);
const f = (casa: string, label: string, value: string, extra: Partial<DavField> = {}): DavField => ({ casa, label, value, copy: extra.copy ?? value, ...extra });

/** Todas as casas da DAV que o painel sabe preencher, pela ordem do portal. */
export function davSections(requester: Modelo9Requester, vehicle: Modelo9Vehicle, customs: Record<string, string>, entryDate: string | null): DavSection[] {
  const c = customs;
  const nif = requester.nif.replace(/\D/g, "");
  const empresa = nifDeEmpresa(nif);
  const morada = [requester.address, [requester.postalCode, requester.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const categoria = vehicle.category || categoriaPT(vehicle);
  const fiscal = tipoFiscal(vehicle);
  const fuel = vehicle.fuel ?? "";
  const electric = isElectric(fuel);
  const transport = c.transportMeans || (c.entryType === "autotransportado" ? "2" : c.entryType === "proprios" ? "1" : "");
  const num = (v: string) => (v ? String(numero(v) ?? v) : "");
  const sel = (options: Option[], key: string) => {
    const label = optionLabel(options, c[key]);
    return { value: label, copy: c[key] ?? "" };
  };
  const firstReg = normalizarDataMatricula(vehicle.firstRegistration);

  return [
    {
      title: "A — Geral",
      fields: [
        f("01", "Alfândega", c.customsOffice ?? "", { hint: "Regime geral: qualquer alfândega (escolher na lista)" }),
        f("02", "Estatuto do sujeito passivo", sel(TAXPAYER, "taxpayerStatus").value, { copy: c.taxpayerStatus ?? "", hint: "3 = sem estatuto / particular, se não tiverem nº de operador" }),
        f("05", "Regime do ISV", "01 — Introdução no consumo, regime geral", { copy: "01" }),
      ],
    },
    {
      title: "B — Adquirente / proprietário",
      fields: [
        f("06", "Tipo de identificação", nif ? (empresa ? "NIF coletivo (empresa)" : "NIF singular") : ""),
        f("06a", "NIF do proprietário", nif, { required: true, hint: "As casas 07 a 13 enchem-se sozinhas" }),
      ],
    },
    {
      title: "C — Declarante / representante",
      fields: [f("14", "Qualidade de representação", sel(REPRESENTATION, "representation").value, { copy: c.representation ?? "" })],
    },
    {
      title: "E — Características do veículo",
      fields: [
        f("30", "Código de homologação (IMT)", vehicle.homologation, { hint: "Com este número várias casas enchem-se sozinhas" }),
        f("31", "Categoria do veículo", categoria === "Ligeiro" ? "01 — Ligeiro" : categoria, { copy: categoria === "Ligeiro" ? "01" : categoria, required: true }),
        f("33", "Tipo de veículo fiscal", fiscal.value, { copy: code(fiscal.value), hint: fiscal.hint, required: true }),
        f("34", "Marca", vehicle.make, { required: true }),
        f("35", "Modelo", vehicle.model, { required: true }),
        f("36", "Variante / versão", [vehicle.variant, vehicle.version].filter(Boolean).join(" / ")),
        f("37", "Peso bruto total (kg)", num(vehicle.grossWeightKg), { required: true }),
        f("38", "Tara (kg)", num(vehicle.tareKg)),
        f("39", "Combustível", combustivelDav(fuel), { copy: /^\d\d — /.test(combustivelDav(fuel)) ? code(combustivelDav(fuel)) : fuel, hint: "Escolher na lista se não tiver código", required: true }),
        f("40", "Cor", vehicle.color, { hint: "Escolher na lista (cor 1)" }),
        f("41", "Tipo de caixa (carroçaria)", c.bodyType ?? "", { hint: "Escolher na lista do portal" }),
        f("42", "Número de quadro (VIN)", vehicle.vin, { required: true }),
        f("43", "Número do motor", vehicle.engineNumber, { hint: "Facultativo" }),
        f("44", "Número de lugares", num(vehicle.seats), { required: true }),
        f("45", "Cilindrada (cm³)", electric ? "" : vehicle.engineCc, { required: !electric, hint: electric ? "Elétrico: sem cilindrada" : undefined }),
        f("46", "Nº de eixos motores", c.driveAxles ?? "", { hint: "CoC" }),
        f("50", "Emissões de CO₂ (g/km, ciclo combinado)", electric ? "0" : vehicle.co2, {
          required: !electric,
          hint: c.co2Cycle ? `Ciclo ${c.co2Cycle}` : "Indicar o ciclo (WLTP/NEDC) do CoC; sem CO₂ no CoC é preciso a medição num centro de inspeção",
        }),
        ...(isDiesel(fuel) ? [f("51", "Partículas (g/km)", c.particles ?? "", { hint: "Só gasóleo (CoC)", required: true })] : []),
        ...(isPlugIn(fuel) ? [f("52", "Autonomia elétrica (km)", c.batteryRange ?? "", { hint: "Só plug-in", required: true })] : []),
        f("53", "Caixa de velocidades", sel(GEARBOX, "gearbox").value, { copy: c.gearbox ?? "" }),
      ],
    },
    {
      title: "F — Apresentação do veículo",
      fields: [
        f("55", "Veículo novo / usado", "Usado"),
        f("56", "País de procedência", paisOrigemValido(vehicle.originCountry), {
          required: true,
          hint: vehicle.originCountry && !paisOrigemValido(vehicle.originCountry) ? "No Modelo 9 está «Portugal»: corrija para o país do livrete" : "Escolher na lista",
        }),
        f("57", "Quilómetros à data da DAV", c.kmAtDav ?? "", { required: true, hint: "Conta-quilómetros" }),
      ],
    },
    {
      title: "G — Matrículas anteriores",
      fields: [
        f("60", "Data da 1.ª matrícula", br(firstReg), { copy: br(firstReg), required: true, hint: "Livrete, campo B" }),
        f("61", "Nº de matrícula definitiva", vehicle.foreignPlate, { required: true, hint: "Livrete, campo A" }),
        f("62", "Data de atribuição da matrícula definitiva", br(c.previousPlateDate ?? ""), { hint: "Livrete, campo I" }),
      ],
    },
    {
      title: "H — Entrada em Portugal",
      fields: [
        f("66", "Data de entrada", br(entryDate ?? ""), { required: true, hint: "Carro transportado: data de receção no CMR" }),
        f("66a", "Tipo de entrada", c.entryType === "autotransportado" ? "Autotransportado" : c.entryType === "proprios" ? "Pelos próprios meios" : ""),
      ],
    },
    {
      title: "J — Base tributável do IVA",
      fields: [
        f("75", "Data de transmissão (venda)", br(c.invoiceDate ?? ""), { hint: "Fatura" }),
        f("76", "Quilómetros à data da venda", c.kmAtSale ?? "", { hint: "Fatura" }),
        f("77", "Valor de aquisição", c.purchasePrice ?? "", { hint: "Fatura" }),
      ],
    },
    {
      title: "L — Modo de pagamento",
      fields: [f("84", "Modo de pagamento", sel(PAY_MODE, "paymentMode").value, { copy: c.paymentMode === "T" ? "T" : sel(PAY_MODE, "paymentMode").value })],
    },
    {
      title: "M — IMT",
      fields: [f("89", "Serviço emissor da matrícula", c.imtService ?? "", { hint: "As casas 90 e 91 enchem-se depois do pagamento" })],
    },
    {
      title: "Dados complementares",
      fields: [
        f("DC01", "Vendedor — nome", c.sellerName ?? "", { required: true }),
        f("DC02", "Vendedor — sede", c.sellerAddress ?? ""),
        f("DC03", "Vendedor — NIF / nº de IVA", c.sellerNif ?? ""),
        f("DC04", "Vendedor — qualidade", sel(SELLER_KIND, "sellerKind").value, { copy: c.sellerKind ?? "" }),
        f("DC05", "Comprador — nome", requester.name, { required: true }),
        f("DC06", "Comprador — morada", morada),
        f("DC07", "Comprador — NIF", nif),
        f("DC08", "Comprador — qualidade", nif ? (empresa ? "1 — Empresa" : "2 — Particular") : "", { copy: nif ? (empresa ? "1" : "2") : "" }),
        f("DC09", "Enquadramento de IVA do comprador", sel(BUYER_VAT, "buyerVat").value, { copy: c.buyerVat ?? "" }),
        f("DC10", "Nº da fatura", c.invoiceNumber ?? "", { required: true }),
        f("DC11", "Data da fatura", br(c.invoiceDate ?? ""), { required: true }),
        f("DC12", "Regime de IVA", sel(VAT_REGIME, "vatRegime").value, { copy: c.vatRegime ?? "" }),
        f("DC13", "Preço", c.purchasePrice ?? "", { required: true }),
        f("DC14", "Moeda", c.currency || (c.purchasePrice ? "EUR" : "")),
        f("DC15", "Meio de pagamento", sel(PAYMENT, "paymentMethod").value, { copy: c.paymentMethod ?? "" }),
        f("DC16", "Intermediários", optionLabel(YES_NO, c.intermediary), { copy: optionLabel(YES_NO, c.intermediary) }),
        ...(c.intermediary === "sim" ? [f("DC17", "Intermediário — identificação", c.intermediaryName ?? "", { required: true })] : []),
        f("DC21", "Meio de transporte", optionLabel(TRANSPORT, transport), { copy: transport }),
        f("DC22", "Transportadora — nome", c.carrierName ?? "", { hint: "CMR" }),
        f("DC23", "Transportadora — sede", c.carrierAddress ?? "", { hint: "CMR" }),
        f("DC24", "Transportadora — NIF", c.carrierNif ?? "", { hint: "CMR" }),
        f("DC26", "Como soube do negócio", sel(DEAL_SOURCE, "dealSource").value, { copy: c.dealSource ?? "" }),
        ...(c.dealSource === "1" ? [f("DC27", "Site", c.dealSite ?? "")] : []),
      ],
    },
  ];
}

/** Casas obrigatórias ainda vazias (para avisar antes de ir ao portal). */
export function davMissing(sections: DavSection[]): DavField[] {
  return sections.flatMap((s) => s.fields.filter((x) => x.required && !x.value.trim()));
}

/** Texto para "Copiar tudo". */
export function davText(sections: DavSection[]): string {
  return sections.flatMap((s) => s.fields.filter((x) => x.value.trim()).map((x) => `${x.casa} ${x.label}: ${x.value}`)).join("\n");
}

/* ───────────── Documentos ───────────── */

/** Documentos a anexar na DAV (casa 92), pela ordem das instruções da AT. */
export const DAV_DOCUMENTS: { kind: string; label: string; required: boolean }[] = [
  { kind: "livrete_estrangeiro", label: "Certificado de matrícula estrangeiro (livrete)", required: true },
  { kind: "fatura", label: "Fatura / declaração de venda", required: true },
  { kind: "identificacao", label: "Documento com o NIF do proprietário", required: true },
  { kind: "coc", label: "Certificado de conformidade (CoC)", required: true },
  { kind: "modelo9_assinado", label: "Modelo 9 com homologação e inspeção", required: true },
  { kind: "inspecao_b", label: "Ficha de inspeção (Modelo 112)", required: false },
  { kind: "transporte", label: "CMR e recibo (se veio transportado)", required: false },
];

/** Documentos guardados em cada etapa (para mostrar e para o tipo por omissão no envio). */
export const STAGE_DOCUMENTS: Record<Exclude<Stage, "concluido">, string[]> = {
  modelo9: ["livrete_estrangeiro", "coc", "identificacao", "fatura", "exportacao", "modelo9", "modelo9_assinado", "homologacao", "inspecao_b"],
  alfandega: ["fatura", "transporte", "dav", "isv"],
  registo: ["registo", "dua"],
};

/* ───────────── Registo inicial ───────────── */

export type RegistrationField = { key: string; label: string; type?: "date" | "select"; options?: Option[]; hint?: string; wide?: boolean; placeholder?: string };
export const REG_TYPES: Option[] = [
  ["conservatoria", "Conservatória (comprovativo de apresentação)"],
  ["solicitador", "Automóvel Online (requerimento do solicitador)"],
];

export const REGISTRATION_GROUPS: { title: string; hint?: string; fields: RegistrationField[] }[] = [
  {
    title: "Entrega no IMT — matrícula portuguesa",
    hint: "Com a DAV paga: Modelo 9, CoC, livrete estrangeiro autenticado pela Alfândega, DAV com a matrícula, Modelo 112 (válido 90 dias úteis) e identificação do requerente. Taxa: 45 € (165 € sem CoC nem homologação).",
    fields: [
      { key: "imtDate", label: "Entregue no IMT em", type: "date" },
      { key: "imtService", label: "Serviço do IMT" },
      { key: "imtRequest", label: "Nº do processo no IMT" },
      { key: "imtFee", label: "Taxa paga (€)" },
      { key: "ptPlate", label: "Matrícula portuguesa", placeholder: "AA-00-BB", hint: "Passa também para a ficha do carro" },
      { key: "plateDate", label: "Matrícula atribuída em", type: "date" },
    ],
  },
  {
    title: "Registo de propriedade",
    hint: "60 dias a contar da matrícula. Conservatória: o nome é o do titular. Automóvel Online: o nome é o do comprador (sujeito ativo). Emolumento: 55 € (46,75 € online).",
    fields: [
      { key: "regType", label: "Onde foi feito", type: "select", options: REG_TYPES, wide: true },
      { key: "regNumber", label: "Nº de apresentação / nº do pedido" },
      { key: "regDate", label: "Data do registo", type: "date" },
      { key: "holderName", label: "Titular registado", wide: true },
      { key: "regFee", label: "Emolumento pago (€)" },
      { key: "certReceivedAt", label: "Certificado de matrícula recebido em", type: "date" },
    ],
  },
];

/** Prazo do registo de propriedade: 60 dias a contar da matrícula portuguesa. */
export function registoDeadline(plateDate: string | null | undefined): string | null {
  return validIso(plateDate) ? addDays(plateDate, REGISTO_DAYS) : null;
}
/** Etapa 1: homologação no IMT e inspeção tipo B (Modelo 112). Depois de voltar da inspeção, o carro segue para a Alfândega. */
export const INSPECTION_FIELDS: RegistrationField[] = [
  { key: "homologationRequestedAt", label: "Homologação pedida em", type: "date" },
  { key: "homologationApprovedAt", label: "Homologação aprovada em", type: "date" },
  { key: "inspectionDate", label: "Inspeção tipo B feita em", type: "date" },
  { key: "inspectionCenter", label: "Centro de inspeção" },
  { key: "inspectionNumber", label: "Nº do Modelo 112", hint: "Válido 90 dias úteis" },
];

export const REGISTRATION_KEYS = [...REGISTRATION_GROUPS.flatMap((g) => g.fields.map((x) => x.key)), ...INSPECTION_FIELDS.map((x) => x.key)];
export const regTypeLabel = (v: string | undefined) => optionLabel(REG_TYPES, v);
