/** Dados para o Contrato de assunção de responsabilidade de uma venda a prestações (tudo pré-preenchido). */
import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ASSUNCAO_TEMPLATE, type AssuncaoInput, type Outorgante } from "@/lib/assuncao";
import { todayLisbon } from "@/lib/cobrancas";
import { formatPlate } from "@/lib/pt-validation";
import { getCompanyInfo, type CompanyKind } from "./settings";

export const STAND_PARTY_KEY = "assuncao_stand";

export type StandParties = Record<CompanyKind, Outorgante & { label: string; city: string }>;

/** As duas empresas do stand como outorgante (com o último representante usado neste contrato). */
async function standParties(): Promise<StandParties> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, STAND_PARTY_KEY)).limit(1);
  const saved = (row?.value ?? {}) as Partial<Record<CompanyKind, Partial<Outorgante>>>;
  const out = {} as StandParties;
  for (const kind of ["rent", "sale"] as const) {
    const c = await getCompanyInfo(kind);
    const base: Outorgante = {
      empresa: true,
      nome: c.legalName,
      nif: c.nipc,
      morada: [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      representante: c.representativeName,
      representanteNif: "",
    };
    const s = saved[kind] ?? {};
    out[kind] = { ...base, ...Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === "string" && v.trim())), empresa: true, label: c.legalName, city: c.city };
  }
  return out;
}

export async function assuncaoSetup(chargeId: string) {
  const [c] = await db
    .select({
      customerId: schema.chargeContracts.customerId,
      vehicleId: schema.chargeContracts.vehicleId,
      make: schema.chargeContracts.make,
      model: schema.chargeContracts.model,
      plate: schema.chargeContracts.plate,
      debtCents: schema.chargeContracts.debtCents,
      name: schema.customers.fullName,
      nif: schema.customers.nif,
      address: schema.customers.address,
      postalCode: schema.customers.postalCode,
      city: schema.customers.city,
      country: schema.customers.country,
    })
    .from(schema.chargeContracts)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.chargeContracts.customerId))
    .where(eq(schema.chargeContracts.id, chargeId))
    .limit(1);
  if (!c) return null;
  const [vehicle] = c.vehicleId ? await db.select({ version: schema.vehicles.version }).from(schema.vehicles).where(eq(schema.vehicles.id, c.vehicleId)).limit(1) : [];
  const installments = await db
    .select({ dueDate: schema.chargeInstallments.dueDate, amountCents: schema.chargeInstallments.amountCents })
    .from(schema.chargeInstallments)
    .where(eq(schema.chargeInstallments.contractId, chargeId))
    .orderBy(asc(schema.chargeInstallments.dueDate));
  // A prestação "do mês" é o valor mais repetido (a última costuma levar o acerto).
  const counts = new Map<number, number>();
  for (const i of installments) counts.set(i.amountCents, (counts.get(i.amountCents) ?? 0) + 1);
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const stands = await standParties();
  const defaults: AssuncaoInput = {
    primeiro: (({ label: _l, city: _c, ...o }) => o)(stands.rent),
    segundo: {
      empresa: false,
      nome: c.name,
      nif: c.nif ?? "",
      morada: [c.address, [c.postalCode, c.city].filter(Boolean).join(" "), c.country && c.country !== "Portugal" ? c.country : ""].filter(Boolean).join(", "),
      representante: "",
      representanteNif: "",
    },
    viatura: [c.make, c.model, vehicle?.version].filter(Boolean).join(" "),
    matricula: c.plate ? formatPlate(c.plate) : "",
    entidade: "",
    prestacao: usual ? usual / 100 : null,
    numPrestacoes: installments.length || null,
    divida: c.debtCents ? c.debtCents / 100 : null,
    primeiraData: installments[0]?.dueDate ?? "",
    iuc: null,
    penal: 500,
    avalista: "",
    avalistaNif: "",
    local: stands.rent.city,
    data: todayLisbon(),
  };

  const generated = await db
    .select({ id: schema.generatedForms.id, fileId: schema.generatedForms.fileId, createdAt: schema.generatedForms.createdAt, by: schema.users.name })
    .from(schema.generatedForms)
    .leftJoin(schema.users, eq(schema.users.id, schema.generatedForms.createdBy))
    .where(and(eq(schema.generatedForms.template, ASSUNCAO_TEMPLATE), sql`${schema.generatedForms.data}->>'cobranca.id' = ${chargeId}`))
    .orderBy(desc(schema.generatedForms.createdAt));

  return {
    defaults,
    stands,
    generated: generated.map((g) => ({ id: g.id, fileId: g.fileId, createdAt: g.createdAt.toISOString(), by: g.by ?? "—" })),
  };
}
