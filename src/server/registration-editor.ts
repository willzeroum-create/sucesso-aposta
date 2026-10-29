/**
 * Dados do ecrã da Compra e venda. A página /painel/registo/[id] e o separador "Venda" da ficha do carro
 * mostram exatamente o mesmo editor com isto.
 */
import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  emptyParty,
  emptyPayment,
  emptyRegistrationVehicle,
  REGISTRATION_DOCS,
  type RegistrationDoc,
  type RegistrationParty,
  type RegistrationPayment,
  type RegistrationVehicle,
} from "@/lib/registo";
import { can, type SessionUser } from "./auth/session";
import { customerOptions, templateInfos } from "./queries";
import { getCompanyInfo, type CompanyInfo } from "./settings";

type RegistrationRow = typeof schema.registrations.$inferSelect;

const asParty = (c: CompanyInfo): RegistrationParty => ({
  ...emptyParty("empresa"),
  name: c.legalName,
  nif: c.nipc,
  certCode: c.certCode,
  address: c.address,
  postalCode: c.postalCode,
  city: c.city,
  email: c.email,
});

export async function registrationEditorProps(row: RegistrationRow, user: SessionUser) {
  const [stock, sale, rent, customers, templates] = await Promise.all([
    db
      .select({ id: schema.vehicles.id, make: schema.vehicles.make, model: schema.vehicles.model, plate: schema.vehicles.plate, vin: schema.vehicles.vin })
      .from(schema.vehicles)
      .orderBy(desc(schema.vehicles.updatedAt))
      .limit(500),
    getCompanyInfo("sale"),
    getCompanyInfo("rent"),
    customerOptions(),
    templateInfos(),
  ]);
  const [linked] = row.vehicleId
    ? await db.select({ status: schema.vehicles.status, buyerCustomerId: schema.vehicles.buyerCustomerId }).from(schema.vehicles).where(eq(schema.vehicles.id, row.vehicleId)).limit(1)
    : [];
  return {
    id: row.id,
    initial: {
      buyer: { ...emptyParty(), ...row.buyer } as RegistrationParty,
      seller: { ...emptyParty(), ...row.seller } as RegistrationParty,
      vehicle: { ...emptyRegistrationVehicle(), ...row.vehicle } as RegistrationVehicle,
      contractDate: row.contractDate ?? "",
      vehicleId: row.vehicleId,
      status: row.status,
      notes: row.notes ?? "",
      payment: { ...emptyPayment(), ...(row.payment ?? {}) } as RegistrationPayment,
      guarantor: row.guarantor ? ({ ...emptyParty(), ...row.guarantor } as RegistrationParty) : null,
      docs: (row.docs ?? []) as RegistrationDoc[],
    },
    canCharge: can(user, "billing.manage"),
    canMarkSold: can(user, "vehicles.status"),
    vehicleSold: linked?.status === "sold",
    vehicles: stock.map((v) => ({ id: v.id, label: `${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ""}`, plate: v.plate ?? "", make: v.make, model: v.model, vin: v.vin ?? "" })),
    customers,
    companies: [
      { key: "sale", label: sale.legalName || "Empresa de vendas", party: asParty(sale) },
      { key: "rent", label: rent.legalName || "Empresa de aluguer", party: asParty(rent) },
    ],
    // Os documentos da venda (o "3. Documentos" da ficha do carro), com os títulos de Configurações → Modelos.
    docOptions: REGISTRATION_DOCS.map((d) => templates.find((t) => t.id === d.id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ id: t.id, title: t.title, description: t.description })),
    pdfUrl: row.generatedFileId ? `/api/admin/files/${row.generatedFileId}` : null,
  };
}

/** A compra e venda mais recente de um carro do stock (para o separador "Venda" da ficha). */
export async function latestVehicleRegistration(vehicleId: string): Promise<RegistrationRow | null> {
  const [row] = await db.select().from(schema.registrations).where(eq(schema.registrations.vehicleId, vehicleId)).orderBy(desc(schema.registrations.updatedAt)).limit(1);
  return row ?? null;
}
