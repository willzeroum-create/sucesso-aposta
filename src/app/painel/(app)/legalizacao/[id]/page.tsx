import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { LegalizationEditor } from "@/components/painel/legalization-editor";
import { emptyRequester, emptyVehicle, type Modelo9Requester, type Modelo9Vehicle } from "@/lib/modelo9";
import { requirePagePermission } from "@/server/auth/session";
import { customerOptions, vehicleOptions } from "@/server/queries";
import { getCompanyInfo, type CompanyInfo } from "@/server/settings";

export const metadata = { title: "Modelo 9 e homologação" };

const asRequester = (c: CompanyInfo): Modelo9Requester => ({
  ...emptyRequester("empresa"),
  name: c.legalName,
  nif: c.nipc,
  certCode: c.certCode,
  address: c.address,
  postalCode: c.postalCode,
  city: c.city,
  email: c.email,
  phone: c.phone,
});

export default async function LegalizationPage(props: PageProps<"/painel/legalizacao/[id]">) {
  await requirePagePermission("forms.generate");
  const { id } = await props.params;
  const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
  if (!row) notFound();
  const files = row.fileIds.length
    ? await db
        .select({ id: schema.files.id, name: schema.files.originalName, mime: schema.files.mime })
        .from(schema.files)
        .where(inArray(schema.files.id, row.fileIds))
    : [];
  const [sale, rent] = [await getCompanyInfo("sale"), await getCompanyInfo("rent")];
  const vehicle = { ...emptyVehicle(), ...row.vehicle } as Modelo9Vehicle;
  const title = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Novo processo";

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/legalizacao" className="a-crumb">
        <ChevronLeft size={15} /> Modelo 9 e homologação
      </Link>
      <div className="a-head">
        <div>
          <h1>{title}</h1>
          <p>{[vehicle.foreignPlate, vehicle.originCountry].filter(Boolean).join(" · ") || "Comece pelas fotografias do livrete estrangeiro."}</p>
        </div>
      </div>
      <LegalizationEditor
        id={row.id}
        initial={{
          requester: { ...emptyRequester(), ...row.requester } as Modelo9Requester,
          vehicle,
          vehicleId: row.vehicleId,
          status: row.status,
          notes: row.notes ?? "",
        }}
        files={row.fileIds.map((fid) => files.find((f) => f.id === fid)).filter((f): f is (typeof files)[number] => Boolean(f))}
        vehicles={await vehicleOptions(true)}
        customers={await customerOptions()}
        companies={[
          { key: "sale", label: sale.legalName || "Empresa de vendas", requester: asRequester(sale) },
          { key: "rent", label: rent.legalName || "Empresa de aluguer", requester: asRequester(rent) },
        ]}
        modelo9Url={row.modelo9FileId ? `/api/admin/files/${row.modelo9FileId}` : null}
      />
    </div>
  );
}
