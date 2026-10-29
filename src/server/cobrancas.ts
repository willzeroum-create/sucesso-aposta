import "server-only";
import { desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { assemble, summary, todayLisbon, type Contract, type ContractRow, type PaymentRow } from "@/lib/cobrancas";

const second = alias(schema.customers, "second_customer");

async function rows(contractIds?: string[]) {
  const base = db
    .select({
      id: schema.chargeContracts.id,
      customerId: schema.chargeContracts.customerId,
      customerName: schema.customers.fullName,
      customerPhone: schema.customers.phone,
      secondCustomerId: schema.chargeContracts.secondCustomerId,
      secondCustomerName: second.fullName,
      vehicleId: schema.chargeContracts.vehicleId,
      make: schema.chargeContracts.make,
      model: schema.chargeContracts.model,
      color: schema.chargeContracts.color,
      year: schema.chargeContracts.year,
      plate: schema.chargeContracts.plate,
      vin: schema.chargeContracts.vin,
      deliveryDate: schema.chargeContracts.deliveryDate,
      saleCents: schema.chargeContracts.saleCents,
      financedCents: schema.chargeContracts.financedCents,
      downCents: schema.chargeContracts.downCents,
      debtCents: schema.chargeContracts.debtCents,
      notes: schema.chargeContracts.notes,
      createdAt: schema.chargeContracts.createdAt,
    })
    .from(schema.chargeContracts)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.chargeContracts.customerId))
    .leftJoin(second, eq(second.id, schema.chargeContracts.secondCustomerId));
  const contracts = (await (contractIds ? base.where(inArray(schema.chargeContracts.id, contractIds)) : base).orderBy(desc(schema.chargeContracts.createdAt))).map(
    (c) => ({ ...c, customerPhone: c.customerPhone ?? "" }) satisfies ContractRow,
  );
  if (!contracts.length) return { contracts, installments: [], payments: [] as PaymentRow[] };
  const ids = contracts.map((c) => c.id);
  const installments = await db.select().from(schema.chargeInstallments).where(inArray(schema.chargeInstallments.contractId, ids));
  const payments = await db.select().from(schema.chargePayments).where(inArray(schema.chargePayments.contractId, ids)).orderBy(desc(schema.chargePayments.date));
  return { contracts, installments, payments: payments as PaymentRow[] };
}

export async function chargesOverview() {
  const today = todayLisbon();
  const r = await rows();
  const contracts = assemble(r.contracts, r.installments, r.payments, today);
  return { contracts, ...summary(contracts, r.payments, today) };
}

export async function chargeContract(id: string): Promise<{ contract: Contract; payments: PaymentRow[] } | null> {
  const r = await rows([id]);
  if (!r.contracts.length) return null;
  const [contract] = assemble(r.contracts, r.installments, r.payments, todayLisbon());
  return { contract, payments: r.payments };
}

/** Contratos de um cliente (também como segundo titular) ou de uma viatura (para mostrar noutras páginas). */
export async function chargeContractsFor(filter: { customerId?: string; vehicleId?: string }): Promise<Contract[]> {
  const where = filter.customerId
    ? or(eq(schema.chargeContracts.customerId, filter.customerId), eq(schema.chargeContracts.secondCustomerId, filter.customerId))
    : filter.vehicleId ? eq(schema.chargeContracts.vehicleId, filter.vehicleId) : null;
  if (!where) return [];
  const ids = (await db.select({ id: schema.chargeContracts.id }).from(schema.chargeContracts).where(where)).map((x) => x.id);
  if (!ids.length) return [];
  const r = await rows(ids);
  return assemble(r.contracts, r.installments, r.payments, todayLisbon());
}
