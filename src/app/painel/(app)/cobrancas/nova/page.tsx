import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { ChargeContractForm, type ChargePrefill, type HolderDraft } from "@/components/painel/charges";
import { DOC_TYPE_LABEL, emptyParty, emptyPayment, paymentPending, type RegistrationParty, type RegistrationPayment } from "@/lib/registo";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Nova venda a prestações" };

const euros = (v: number) => (v ? String(v).replace(".", ",") : "");

/** Vem da compra e venda: comprador, carro e valores já preenchidos para conferir (o 2.º titular junta-se aqui). */
async function fromRegistration(registrationId: string, customers: { id: string; nif: string | null }[]): Promise<ChargePrefill | null> {
  const [r] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId)).limit(1);
  if (!r) return null;
  const pay = { ...emptyPayment(), ...(r.payment ?? {}) } as RegistrationPayment;
  // Já passou para as Cobranças: abre essa venda em vez de criar outra.
  if (pay.chargeId) {
    const [c] = await db.select({ id: schema.chargeContracts.id }).from(schema.chargeContracts).where(eq(schema.chargeContracts.id, pay.chargeId)).limit(1);
    if (c) redirect(`/painel/cobrancas/${c.id}`);
  }
  const holder = (raw: Record<string, string>): HolderDraft => {
    const p = { ...emptyParty(), ...raw } as RegistrationParty;
    const nif = p.nif.replace(/\D/g, "");
    const known = nif ? customers.find((c) => (c.nif ?? "").replace(/\D/g, "") === nif) : undefined;
    const person = p.kind === "particular" && p.docNumber.trim();
    return {
      mode: known ? "existing" : "new",
      customerId: known?.id ?? "",
      newCustomer: {
        fullName: p.name,
        phone: "",
        nif,
        email: p.email,
        address: p.address,
        postalCode: p.postalCode,
        city: p.city,
        idDocumentType: person ? (p.docType === "outro" ? p.docTypeOther : DOC_TYPE_LABEL[p.docType]) : "",
        idDocumentNumber: person ? p.docNumber : "",
        idDocumentExpiry: person ? p.docExpiry : "",
      },
    };
  };
  const v = r.vehicle ?? {};
  return {
    from: `da compra e venda${v.plate ? ` ${v.plate}` : ""}`,
    registrationId: r.id,
    holder: holder(r.buyer),
    second: null,
    vehicleId: r.vehicleId ?? "",
    vehicle: { make: v.make ?? "", model: v.model ?? "", plate: v.plate ?? "", vin: v.vin ?? "" },
    deliveryDate: r.contractDate ?? "",
    values: { sale: pay.sale, down: pay.down, bank: pay.bank, debt: euros(paymentPending(pay)) },
  };
}

export default async function NewChargePage(props: PageProps<"/painel/cobrancas/nova">) {
  await requirePagePermission("billing.manage");
  const sp = await props.searchParams;
  const customers = await db
    .select({ id: schema.customers.id, fullName: schema.customers.fullName, nif: schema.customers.nif })
    .from(schema.customers)
    .orderBy(asc(schema.customers.fullName))
    .limit(2000);
  const vehicles = await db
    .select({
      id: schema.vehicles.id,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      color: schema.vehicles.color,
      year: schema.vehicles.year,
      plate: schema.vehicles.plate,
      vin: schema.vehicles.vin,
      price: schema.vehicles.priceEur,
    })
    .from(schema.vehicles)
    .orderBy(desc(schema.vehicles.updatedAt))
    .limit(500);
  const prefill = typeof sp.registo === "string" ? await fromRegistration(sp.registo, customers) : null;

  return (
    <div className="a-page" style={{ maxWidth: 900 }}>
      <Link href="/painel/cobrancas" className="a-crumb">
        <ChevronLeft size={15} /> Cobranças
      </Link>
      <div className="a-head">
        <div>
          <h1>Nova venda a prestações</h1>
          <p>Cliente, viatura e plano de prestações. Depois é só marcar cada prestação como recebida.</p>
        </div>
      </div>
      <ChargeContractForm
        customers={customers.map((c) => ({ id: c.id, label: c.nif ? `${c.fullName} · NIF ${c.nif}` : c.fullName }))}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          label: `${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ""}`,
          make: v.make,
          model: v.model,
          color: v.color ?? "",
          year: v.year,
          plate: v.plate ?? "",
          vin: v.vin ?? "",
          price: v.price,
        }))}
        defaultVehicleId={typeof sp.viatura === "string" ? sp.viatura : undefined}
        prefill={prefill ?? undefined}
      />
    </div>
  );
}
