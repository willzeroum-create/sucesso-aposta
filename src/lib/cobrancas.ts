/**
 * Cobranças de vendas a prestações — regras portadas da app Cobrar (puras, testadas).
 * Valores guardados em cêntimos; para mostrar usam-se euros. Datas AAAA-MM-DD no fuso de Lisboa.
 */

export type InstallmentStatus = "paga" | "parcial" | "pendente" | "hoje" | "atrasada";
export type ContractStatus = "em_dia" | "atrasado" | "quitado" | "sem_plano";

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  paga: "Paga",
  parcial: "Parcial",
  pendente: "Por pagar",
  hoje: "Vence hoje",
  atrasada: "Em atraso",
};
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  em_dia: "Em dia",
  atrasado: "Em atraso",
  quitado: "Pago",
  sem_plano: "Sem prestações",
};
export const PAYMENT_METHODS = { dinheiro: "Dinheiro", transferencia: "Transferência", mbway: "MB WAY", outro: "Outro" } as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export const DEFAULT_CHARGE_MESSAGE =
  "Olá {nome}, tudo bem? Passo para lembrar a prestação de {valor} da viatura {viatura}, com vencimento a {vencimento}. Obrigado!";

export interface ContractRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleId: string | null;
  make: string;
  model: string;
  color: string;
  year: number | null;
  plate: string;
  vin: string;
  deliveryDate: string | null;
  saleCents: number;
  financedCents: number;
  downCents: number;
  debtCents: number;
  notes: string;
  createdAt: Date;
}
export interface InstallmentRow {
  id: string;
  contractId: string;
  dueDate: string;
  amountCents: number;
  note: string;
}
export interface PaymentRow {
  id: string;
  contractId: string;
  installmentId: string | null;
  date: string;
  amountCents: number;
  method: string;
  note: string;
}

export interface Installment {
  id: string;
  contractId: string;
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  open: number;
  status: InstallmentStatus;
  daysLate: number;
  paidOn: string | null;
  note: string;
}

export interface Contract {
  id: string;
  customer: { id: string; name: string; phone: string };
  vehicleId: string | null;
  vehicle: { label: string; make: string; model: string; color: string; year: number | null; plate: string; vin: string };
  deliveryDate: string | null;
  sale: number;
  financed: number;
  /** Entrada paga na entrega. */
  down: number;
  /** Dívida financiada pelo stand = o que se cobra em prestações. */
  toCollect: number;
  paidTotal: number;
  balance: number;
  /** Parte do saldo sem nenhuma prestação marcada. */
  unplanned: number;
  installmentsTotal: number;
  installmentsPaid: number;
  next: { id: string; dueDate: string; amount: number } | null;
  lateCount: number;
  lateAmount: number;
  status: ContractStatus;
  notes: string;
  installments: Installment[];
}

export type InstallmentView = Installment & { customer: Contract["customer"]; vehicle: string; plate: string };

/** Formatação partilhada entre servidor e navegador. */
export const money = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
export const datePt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export const toCents = (v: number | string) => Math.round(Number(String(v).replace(",", ".")) * 100);
export const toEuros = (c: number) => Math.round(c) / 100;

export function todayLisbon(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
export const isIsoDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function vehicleLabel(c: Pick<ContractRow, "make" | "model" | "color" | "year">): string {
  return [c.make, c.model, c.color, c.year].filter((p) => p !== "" && p != null).join(" ");
}

/** De quanto em quanto tempo se paga: "mensal" (mesmo dia de cada mês) ou um número de dias (ex.: "15"). */
export type PlanInterval = "mensal" | `${number}`;
export const INTERVAL_PRESETS: { value: PlanInterval; label: string }[] = [
  { value: "mensal", label: "Todos os meses (mesmo dia)" },
  { value: "7", label: "A cada 7 dias (semanal)" },
  { value: "14", label: "A cada 14 dias" },
  { value: "15", label: "A cada 15 dias (quinzenal)" },
  { value: "20", label: "A cada 20 dias" },
  { value: "30", label: "A cada 30 dias" },
];
export function intervalLabel(interval: string): string {
  if (interval === "mensal") return "todos os meses";
  const days = Number(interval);
  return days === 1 ? "todos os dias" : `a cada ${days} dias`;
}

/** Plano de prestações (mensal ou a cada N dias): o resto dos cêntimos vai para a última. */
export function buildPlan(totalCents: number, count: number, firstDue: string, interval: string = "mensal"): { dueDate: string; amountCents: number }[] {
  const days = interval === "mensal" ? 0 : Math.trunc(Number(interval));
  if (!count || count < 1 || totalCents <= 0 || !isIsoDate(firstDue) || (interval !== "mensal" && !(days >= 1 && days <= 366))) return [];
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => ({
    dueDate: days ? addDays(firstDue, days * i) : addMonths(firstDue, i),
    amountCents: i === count - 1 ? totalCents - base * (count - 1) : base,
  }));
}

/** Periodicidade das prestações já marcadas (para sugerir ao acrescentar mais). */
export function inferInterval(dueDates: string[]): string | null {
  if (dueDates.length < 2) return null;
  const [a, b] = dueDates.slice(-2);
  if (addMonths(a, 1) === b) return "mensal";
  const days = daysBetween(a, b);
  return days >= 1 ? String(days) : null;
}

/** Monta contratos, prestações e estados a partir das linhas da base de dados. */
export function assemble(contracts: ContractRow[], installments: InstallmentRow[], payments: PaymentRow[], today: string): Contract[] {
  const paidByInst = new Map<string, { total: number; last: string | null }>();
  const paidByContract = new Map<string, number>();
  for (const p of payments) {
    paidByContract.set(p.contractId, (paidByContract.get(p.contractId) ?? 0) + p.amountCents);
    if (p.installmentId) {
      const a = paidByInst.get(p.installmentId) ?? { total: 0, last: null };
      a.total += p.amountCents;
      if (!a.last || p.date > a.last) a.last = p.date;
      paidByInst.set(p.installmentId, a);
    }
  }
  const sorted = [...installments].sort((a, b) => a.contractId.localeCompare(b.contractId) || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const byContract = new Map<string, Installment[]>();
  for (const r of sorted) {
    const list = byContract.get(r.contractId) ?? [];
    const pg = paidByInst.get(r.id) ?? { total: 0, last: null };
    const open = Math.max(0, r.amountCents - pg.total);
    const status: InstallmentStatus =
      open === 0 ? "paga" : r.dueDate < today ? "atrasada" : r.dueDate === today ? "hoje" : pg.total > 0 ? "parcial" : "pendente";
    list.push({
      id: r.id,
      contractId: r.contractId,
      number: list.length + 1,
      dueDate: r.dueDate,
      amount: toEuros(r.amountCents),
      paid: toEuros(pg.total),
      open: toEuros(open),
      status,
      daysLate: status === "atrasada" ? daysBetween(r.dueDate, today) : 0,
      paidOn: pg.last,
      note: r.note,
    });
    byContract.set(r.contractId, list);
  }

  return contracts.map((c) => {
    const inst = byContract.get(c.id) ?? [];
    const toCollect = Math.max(0, c.debtCents);
    const paid = paidByContract.get(c.id) ?? 0;
    const balance = Math.max(0, toCollect - paid);
    const open = inst.filter((i) => i.status !== "paga");
    const openCents = open.reduce((s, i) => s + toCents(i.open), 0);
    const late = open.filter((i) => i.status === "atrasada");
    const status: ContractStatus = balance === 0 && !open.length ? "quitado" : late.length ? "atrasado" : !open.length ? "sem_plano" : "em_dia";
    return {
      id: c.id,
      customer: { id: c.customerId, name: c.customerName, phone: c.customerPhone },
      vehicleId: c.vehicleId,
      vehicle: { label: vehicleLabel(c), make: c.make, model: c.model, color: c.color, year: c.year, plate: c.plate, vin: c.vin },
      deliveryDate: c.deliveryDate,
      sale: toEuros(c.saleCents),
      financed: toEuros(c.financedCents),
      down: toEuros(c.downCents),
      toCollect: toEuros(toCollect),
      paidTotal: toEuros(paid),
      balance: toEuros(balance),
      unplanned: toEuros(Math.max(0, balance - openCents)),
      installmentsTotal: inst.length,
      installmentsPaid: inst.length - open.length,
      next: open[0] ? { id: open[0].id, dueDate: open[0].dueDate, amount: open[0].open } : null,
      lateCount: late.length,
      lateAmount: toEuros(late.reduce((s, i) => s + toCents(i.open), 0)),
      status,
      notes: c.notes,
      installments: inst,
    };
  });
}

/** Painel: o que está em atraso, o que vence hoje e nos próximos 7 dias, e os totais. */
export function summary(contracts: Contract[], payments: PaymentRow[], today: string) {
  const views: InstallmentView[] = [];
  for (const c of contracts)
    for (const i of c.installments) if (i.status !== "paga") views.push({ ...i, customer: c.customer, vehicle: c.vehicle.label, plate: c.vehicle.plate });
  views.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const limit = addDays(today, 7);
  const late = views.filter((v) => v.status === "atrasada");
  const due = views.filter((v) => v.status === "hoje");
  const sum = (l: InstallmentView[]) => toEuros(l.reduce((s, v) => s + toCents(v.open), 0));
  const month = today.slice(0, 7);
  return {
    today,
    totals: {
      toReceive: toEuros(contracts.reduce((s, c) => s + toCents(c.balance), 0)),
      late: sum(late),
      dueToday: sum(due),
      receivedMonth: toEuros(payments.filter((p) => p.date.startsWith(month)).reduce((s, p) => s + p.amountCents, 0)),
      active: contracts.filter((c) => c.status !== "quitado").length,
    },
    late,
    dueToday: due,
    upcoming: views.filter((v) => v.dueDate > today && v.dueDate <= limit),
    unplanned: contracts.filter((c) => c.status === "sem_plano"),
  };
}

/**
 * Distribui um pagamento: primeiro na prestação indicada, depois nas em aberto mais antigas;
 * o que sobrar fica sem prestação (abate só no saldo).
 */
export function allocatePayment(
  open: { id: string; dueDate: string; missingCents: number }[],
  cents: number,
  preferredId: string | null = null,
): { installmentId: string | null; cents: number }[] {
  const list = open.filter((o) => o.missingCents > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  if (preferredId) list.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
  const out: { installmentId: string | null; cents: number }[] = [];
  let rest = cents;
  for (const o of list) {
    if (rest <= 0) break;
    const part = Math.min(rest, o.missingCents);
    out.push({ installmentId: o.id, cents: part });
    rest -= part;
  }
  if (rest > 0) out.push({ installmentId: null, cents: rest });
  return out;
}

/** Mensagem de cobrança para o cliente (WhatsApp). */
export function chargeMessage(template: string, v: { name: string; amount: number; dueDate: string; vehicle: string; daysLate: number }): string {
  const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v.amount);
  const date = v.dueDate.split("-").reverse().join("/");
  return (template || DEFAULT_CHARGE_MESSAGE)
    .replaceAll("{nome}", v.name.split(/\s+/)[0] ?? v.name)
    .replaceAll("{valor}", eur)
    .replaceAll("{vencimento}", date)
    .replaceAll("{viatura}", v.vehicle)
    .replaceAll("{dias}", String(v.daysLate));
}

export function whatsappLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9 && /^[29]/.test(digits)) digits = `351${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
