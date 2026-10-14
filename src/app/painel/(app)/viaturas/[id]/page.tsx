import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, Car, ExternalLink } from "lucide-react";
import { db, schema } from "@/db";
import { DocumentsPanel } from "@/components/painel/documents-panel";
import { FormGenerator } from "@/components/painel/form-generator";
import { PhotoManager } from "@/components/painel/photo-manager";
import { StatusTrack } from "@/components/painel/status-track";
import { Plate } from "@/components/painel/ui";
import { VehicleForm } from "@/components/painel/vehicle-form";
import { DeleteVehicle } from "@/components/painel/delete-vehicle";
import { VEHICLE_DOCUMENT_KINDS } from "@/lib/document-kinds";
import { dateTime, daysSince, eur, int } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";
import { publicationGaps } from "@/server/public-catalog";
import { customerOptions, documentsFor, entityHistory, formHistory, templateInfos } from "@/server/queries";
import { publicUrl } from "@/server/storage";

const TABS = [
  { key: "dados", label: "Dados" },
  { key: "fotos", label: "Fotografias" },
  { key: "documentos", label: "Documentos" },
  { key: "termos", label: "Termos" },
  { key: "historico", label: "Histórico" },
] as const;

export async function generateMetadata(props: PageProps<"/painel/viaturas/[id]">) {
  const { id } = await props.params;
  const [v] = await db.select({ make: schema.vehicles.make, model: schema.vehicles.model }).from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
  return { title: v ? `${v.make} ${v.model}` : "Viatura" };
}

export default async function VehiclePage(props: PageProps<"/painel/viaturas/[id]">) {
  const user = await requirePagePermission("vehicles.view");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
  if (!v) notFound();

  const photos = await db
    .select({ id: schema.vehiclePhotos.id, alt: schema.vehiclePhotos.alt, key: schema.files.storageKey })
    .from(schema.vehiclePhotos)
    .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
    .where(eq(schema.vehiclePhotos.vehicleId, id))
    .orderBy(asc(schema.vehiclePhotos.position));
  const gallery = photos.map((p) => ({ id: p.id, alt: p.alt, url: publicUrl(p.key) }));
  const cover = gallery.find((p) => p.id === v.coverPhotoId) ?? gallery[0];
  const gaps = publicationGaps(v, gallery.length > 0);
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "dados";
  const canDocs = can(user, "documents.view");
  const canForms = can(user, "forms.generate");
  const customers = can(user, "vehicles.status") || canForms ? await customerOptions() : [];
  const buyer = v.buyerCustomerId ? customers.find((c) => c.id === v.buyerCustomerId) : null;
  const canCosts = can(user, "vehicles.costs");

  const initial: Record<string, string> = Object.fromEntries(
    Object.entries({
      make: v.make, model: v.model, version: v.version, category: v.category, year: v.year, mileageKm: v.mileageKm, fuel: v.fuel,
      transmission: v.transmission, powerHp: v.powerHp, priceEur: v.priceEur, highlight: v.highlight, description: v.description,
      plate: v.plate, vin: v.vin, color: v.color, engineCc: v.engineCc, doors: v.doors, seats: v.seats, firstRegistration: v.firstRegistration,
      registrationDate: v.registrationDate, registrationOwner: v.registrationOwner, vehicleType: v.vehicleType, homologation: v.homologation,
      grossWeightKg: v.grossWeightKg, tareKg: v.tareKg, co2: v.co2, nextInspection: v.nextInspection, internalNotes: v.internalNotes,
      ...(canCosts ? { purchasePriceEur: v.purchasePriceEur, purchaseDate: v.purchaseDate, supplier: v.supplier } : {}),
    }).map(([k, val]) => [k, val === null || val === undefined ? "" : String(val)]),
  );

  const margin = canCosts && v.purchasePriceEur ? (v.soldPriceEur ?? v.priceEur ?? 0) - v.purchasePriceEur : null;

  return (
    <div className="a-page">
      <div>
        <Link href="/painel/viaturas" className="a-crumb">
          <ArrowLeft size={14} /> Viaturas
        </Link>
        <div className="a-vhead">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={cover.alt} className="a-vhead-photo" />
          ) : (
            <div className="a-vhead-photo">
              <Car size={30} />
            </div>
          )}
          <div>
            <h1>
              {v.make} {v.model}
            </h1>
            <p className="muted">{[v.version, v.year, v.mileageKm != null ? `${int.format(v.mileageKm)} km` : null].filter(Boolean).join(" · ")}</p>
            <div className="a-meta">
              <Plate value={v.plate} large />
              {v.priceEur ? <span className="a-price num">{eur.format(v.status === "sold" && v.soldPriceEur ? v.soldPriceEur : v.priceEur)}</span> : null}
              {margin !== null && <span className={`a-pill plain ${margin >= 0 ? "available" : "danger"}`}>Margem {eur.format(margin)}</span>}
              <span>
                No stand há {daysSince(v.createdAt)} dias
                {buyer ? ` · Cliente: ${buyer.fullName}` : ""}
              </span>
              {v.published && v.status !== "preparation" && (
                <a href={`/#${v.slug}`} target="_blank" rel="noopener" className="a-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  Ver no site <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <StatusTrack
        vehicleId={v.id}
        status={v.status}
        published={v.published}
        canChange={can(user, "vehicles.status")}
        gaps={gaps}
        customers={customers.map((c) => ({ id: c.id, fullName: c.fullName, nif: c.nif }))}
        buyerId={v.buyerCustomerId}
        price={v.priceEur}
        soldPrice={v.soldPriceEur}
      />

      <nav className="a-tabs" aria-label="Secções da viatura">
        {TABS.filter((t) => (t.key === "documentos" ? canDocs : t.key === "termos" ? canForms : true)).map((t) => (
          <Link key={t.key} href={`/painel/viaturas/${id}?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} scroll={false}>
            {t.label}
            {t.key === "fotos" && <span className="a-tab-count">{gallery.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "dados" &&
        (can(user, "vehicles.edit") ? (
          <VehicleForm id={v.id} initial={initial} canCosts={canCosts} />
        ) : (
          <section className="a-card a-card-pad">
            <dl className="a-dl">
              {Object.entries(initial).filter(([, val]) => val).map(([k, val]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

      {tab === "fotos" && (
        <section className="a-card a-card-pad">
          <PhotoManager vehicleId={v.id} photos={gallery} coverId={cover?.id ?? null} canEdit={can(user, "vehicles.edit")} />
        </section>
      )}

      {tab === "documentos" && canDocs && (
        <DocumentsPanel owner={{ type: "vehicle", id: v.id }} docs={await documentsFor("vehicle", v.id)} kinds={VEHICLE_DOCUMENT_KINDS} canUpload={can(user, "documents.upload")} />
      )}

      {tab === "termos" && canForms && (
        <FormGenerator
          templates={(await templateInfos()).filter((t) => t.needsVehicle)}
          customers={customers}
          vehicles={[]}
          fixedVehicleId={v.id}
          defaultCustomerId={v.buyerCustomerId}
          defaultPrice={v.soldPriceEur ?? v.priceEur}
          defaultKm={v.mileageKm}
          history={await formHistory({ vehicleId: v.id })}
        />
      )}

      {tab === "historico" && (
        <section className="a-card">
          <div className="a-card-head">
            <h2>Histórico da viatura</h2>
          </div>
          <div className="a-card-body">
            <div className="a-timeline">
              {(await entityHistory("vehicle", v.id)).map((e) => (
                <div className="a-event" key={e.id}>
                  <div>
                    <p>
                      <strong style={{ fontWeight: 600 }}>{e.userName}</strong> — {e.summary}
                    </p>
                    <small>{dateTime(e.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {can(user, "vehicles.delete") && tab === "dados" && v.status !== "sold" && <DeleteVehicle id={v.id} />}
    </div>
  );
}
