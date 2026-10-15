import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { ChargeContractForm } from "@/components/painel/charges";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Nova venda a prestações" };

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
      />
    </div>
  );
}
