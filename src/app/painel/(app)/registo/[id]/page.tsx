import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { RegistrationEditor } from "@/components/painel/registration-editor";
import { emptyParty, emptyPayment, emptyRegistrationVehicle, type RegistrationParty, type RegistrationPayment, type RegistrationVehicle } from "@/lib/registo";
import { can, requirePagePermission } from "@/server/auth/session";
import { customerOptions } from "@/server/queries";
import { getCompanyInfo, type CompanyInfo } from "@/server/settings";

export const metadata = { title: "Compra e venda" };

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

export default async function RegistrationPage(props: PageProps<"/painel/registo/[id]">) {
  const user = await requirePagePermission("forms.generate");
  const { id } = await props.params;
  const [row] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id)).limit(1);
  if (!row) notFound();
  const stock = await db
    .select({ id: schema.vehicles.id, make: schema.vehicles.make, model: schema.vehicles.model, plate: schema.vehicles.plate, vin: schema.vehicles.vin })
    .from(schema.vehicles)
    .orderBy(desc(schema.vehicles.updatedAt))
    .limit(500);
  const [sale, rent] = [await getCompanyInfo("sale"), await getCompanyInfo("rent")];
  const vehicle = { ...emptyRegistrationVehicle(), ...row.vehicle } as RegistrationVehicle;

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/registo" className="a-crumb">
        <ChevronLeft size={15} /> Compra e venda
      </Link>
      <div className="a-head">
        <div>
          <h1>{[vehicle.plate, [vehicle.make, vehicle.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Nova compra e venda"}</h1>
          <p>Requerimento de Registo Automóvel (Modelo 1 RA, IRN).</p>
        </div>
      </div>
      <RegistrationEditor
        id={row.id}
        initial={{
          buyer: { ...emptyParty(), ...row.buyer } as RegistrationParty,
          seller: { ...emptyParty(), ...row.seller } as RegistrationParty,
          vehicle,
          contractDate: row.contractDate ?? "",
          vehicleId: row.vehicleId,
          status: row.status,
          notes: row.notes ?? "",
          payment: { ...emptyPayment(), ...(row.payment ?? {}) } as RegistrationPayment,
          guarantor: row.guarantor ? ({ ...emptyParty(), ...row.guarantor } as RegistrationParty) : null,
        }}
        canCharge={can(user, "billing.manage")}
        vehicles={stock.map((v) => ({ id: v.id, label: `${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ""}`, plate: v.plate ?? "", make: v.make, model: v.model, vin: v.vin ?? "" }))}
        customers={await customerOptions()}
        companies={[
          { key: "sale", label: sale.legalName || "Empresa de vendas", party: asParty(sale) },
          { key: "rent", label: rent.legalName || "Empresa de aluguer", party: asParty(rent) },
        ]}
        pdfUrl={row.generatedFileId ? `/api/admin/files/${row.generatedFileId}` : null}
      />
    </div>
  );
}
