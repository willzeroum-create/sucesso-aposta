import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { LegalizationEditor, type LegalTab } from "@/components/painel/legalization-editor";
import { STAGE_LABEL, STAGE_PILL, isStage } from "@/lib/legalizacao";
import { emptyRequester, emptyVehicle, type Modelo9Requester, type Modelo9Vehicle } from "@/lib/modelo9";
import { requirePagePermission } from "@/server/auth/session";
import { legalClientOptions } from "@/server/legalization";
import { customerOptions, vehicleOptions } from "@/server/queries";
import { getCompanyInfo, type CompanyInfo } from "@/server/settings";

export const metadata = { title: "Legalização" };

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

const TABS: LegalTab[] = ["modelo9", "alfandega", "registo", "documentos"];

export default async function LegalizationPage(props: PageProps<"/painel/legalizacao/[id]">) {
  await requirePagePermission("forms.generate");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
  if (!row) notFound();
  const docs = await db
    .select({ id: schema.documents.id, kind: schema.documents.kind, label: schema.documents.label, fileId: schema.documents.fileId, createdAt: schema.documents.createdAt, mime: schema.files.mime, name: schema.files.originalName })
    .from(schema.documents)
    .innerJoin(schema.files, eq(schema.files.id, schema.documents.fileId))
    .where(and(eq(schema.documents.ownerType, "legalization"), eq(schema.documents.ownerId, id)))
    .orderBy(desc(schema.documents.createdAt));
  const client = row.clientId ? (await db.select({ id: schema.legalClients.id, name: schema.legalClients.name }).from(schema.legalClients).where(eq(schema.legalClients.id, row.clientId)).limit(1))[0] : null;
  const [sale, rent] = [await getCompanyInfo("sale"), await getCompanyInfo("rent")];
  const vehicle = { ...emptyVehicle(), ...row.vehicle } as Modelo9Vehicle;
  const title = [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Carro novo";
  const etapa = typeof sp.etapa === "string" && (TABS as string[]).includes(sp.etapa) ? (sp.etapa as LegalTab) : null;
  const stage = isStage(row.stage) ? row.stage : "modelo9";
  const plates = [vehicle.foreignPlate, row.registration?.ptPlate].filter(Boolean).join(" → ");

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href={client ? `/painel/legalizacao/clientes/${client.id}` : "/painel/legalizacao"} className="a-crumb">
        <ChevronLeft size={15} /> {client ? client.name : "Legalização"}
      </Link>
      <div className="a-head">
        <div>
          <h1>{title}</h1>
          <p>
            {[plates, vehicle.originCountry, vehicle.vin].filter(Boolean).join(" · ") || "Comece pelas fotografias do livrete estrangeiro."}{" "}
            <span className={`a-pill ${STAGE_PILL[stage]}`} style={{ verticalAlign: "middle" }}>
              {STAGE_LABEL[stage]}
            </span>
          </p>
        </div>
      </div>
      <LegalizationEditor
        id={row.id}
        initial={{
          requester: { ...emptyRequester(), ...row.requester } as Modelo9Requester,
          vehicle,
          vehicleId: row.vehicleId,
          clientId: row.clientId,
          stage,
          entryDate: row.entryDate ?? "",
          customs: row.customs ?? {},
          registration: row.registration ?? {},
          status: row.status,
          notes: row.notes ?? "",
        }}
        docs={docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
        vehicles={await vehicleOptions(true)}
        customers={await customerOptions()}
        clients={await legalClientOptions()}
        companies={[
          { key: "sale", label: sale.legalName || "Empresa de vendas", requester: asRequester(sale) },
          { key: "rent", label: rent.legalName || "Empresa de aluguer", requester: asRequester(rent) },
        ]}
        modelo9Url={row.modelo9FileId ? `/api/admin/files/${row.modelo9FileId}` : null}
        initialTab={etapa ?? (stage === "concluido" ? "registo" : stage)}
      />
    </div>
  );
}
