import Link from "next/link";
import { CONTRACT_STATUS_LABEL, holderNames, money } from "@/lib/cobrancas";
import { chargeContractsFor } from "@/server/cobrancas";
import { notFound, redirect } from "next/navigation";
import { and, asc, count, eq, sum } from "drizzle-orm";
import { ArrowLeft, Car, ExternalLink, FileText, Stamp } from "lucide-react";
import { db, schema } from "@/db";
import { DocumentsPanel } from "@/components/painel/documents-panel";
import { FormGenerator, GeneratedHistory } from "@/components/painel/form-generator";
import { PhotoManager } from "@/components/painel/photo-manager";
import { StatusTrack } from "@/components/painel/status-track";
import { Plate } from "@/components/painel/ui";
import { VehicleForm } from "@/components/painel/vehicle-form";
import { DeleteVehicle } from "@/components/painel/delete-vehicle";
import { SalePanel } from "@/components/painel/sale-panel";
import { RegistrationEditor, StartVehicleRegistration } from "@/components/painel/registration-editor";
import { latestVehicleRegistration, registrationEditorProps } from "@/server/registration-editor";
import type { SessionUser } from "@/server/auth/session";
import { CostsPanel } from "@/components/painel/costs-panel";
import { costSummary } from "@/lib/vehicle-costs";
import { VEHICLE_DOCUMENT_KINDS } from "@/lib/document-kinds";
import { dateTime, daysSince, eur, FUEL, int } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";
import { publicationGaps } from "@/server/public-catalog";
import { customerOptions, documentsFor, entityHistory, formHistory, templateInfos } from "@/server/queries";
import { publicUrl } from "@/server/storage";
import { SECTIONS } from "@/lib/sections";
import { SectionMover } from "@/components/painel/section-mover";
import { RentalsCard } from "@/components/painel/rentals";
import { activeRentalVehicleIds, vehicleRentals } from "@/server/rentals";
import { CarJourney } from "@/components/painel/car-journey";
import { DOCUMENT_KINDS } from "@/lib/document-kinds";
import { STAGE_LABEL } from "@/lib/legalizacao";
import { isPtPlate, vehicleLegalization } from "@/server/legalization";

/** Nomes dos campos para a ficha só de leitura (quem não pode editar). */
const FIELD_LABEL: Record<string, string> = {
  make: "Marca", model: "Modelo", version: "Versão", category: "Carroçaria", year: "Ano", mileageKm: "Quilómetros", fuel: "Combustível",
  transmission: "Caixa", powerHp: "Potência (cv)", priceEur: "Preço de venda (€)", highlight: "Destaque", description: "Descrição",
  plate: "Matrícula", vin: "VIN", color: "Cor", engineCc: "Cilindrada", doors: "Portas", seats: "Lugares", firstRegistration: "1.ª matrícula",
  registrationDate: "Matrícula PT", registrationOwner: "Titular", vehicleType: "Tipo", homologation: "Homologação", grossWeightKg: "Peso bruto",
  tareKg: "Tara", co2: "CO₂", nextInspection: "Próxima inspeção", internalNotes: "Notas internas", purchasePriceEur: "Preço de compra",
  purchaseDate: "Data de compra", supplier: "Fornecedor",
};

const TABS = [
  { key: "dados", label: "Dados" },
  { key: "venda", label: "Venda" },
  { key: "aluguer", label: "Aluguer" },
  { key: "custos", label: "Custos" },
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

/**
 * Ficha da viatura. A mesma página serve "Viaturas" (carros do site) e "Estoque" (venda e aluguer):
 * se a ligação apontar para a secção errada, reencaminha — assim qualquer link abre no sítio certo.
 */
export default async function VehiclePage(props: PageProps<"/painel/viaturas/[id]"> & { stockRoute?: boolean }) {
  const user = await requirePagePermission("vehicles.view");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
  if (!v) notFound();
  const query = typeof sp.tab === "string" ? `?tab=${encodeURIComponent(sp.tab)}` : "";
  if (!props.stockRoute && v.section !== "site") redirect(`/painel/estoque/${id}${query}`);
  if (props.stockRoute && v.section === "site") redirect(`/painel/viaturas/${id}${query}`);

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
  const sec = SECTIONS[v.section];
  const base = `${sec.base}/${v.id}`;

  const initial: Record<string, string> = Object.fromEntries(
    Object.entries({
      make: v.make, model: v.model, version: v.version, category: v.category, year: v.year, mileageKm: v.mileageKm, fuel: v.fuel,
      transmission: v.transmission, powerHp: v.powerHp, priceEur: v.priceEur, priceOnRequest: v.priceOnRequest ? "1" : "0", onOrder: v.onOrder ? "1" : "0", highlight: v.highlight, description: v.description,
      plate: v.plate, vin: v.vin, color: v.color, engineCc: v.engineCc, doors: v.doors, seats: v.seats, firstRegistration: v.firstRegistration,
      registrationDate: v.registrationDate, registrationOwner: v.registrationOwner, vehicleType: v.vehicleType, homologation: v.homologation,
      grossWeightKg: v.grossWeightKg, tareKg: v.tareKg, co2: v.co2, nextInspection: v.nextInspection, internalNotes: v.internalNotes,
      ...(canCosts ? { purchasePriceEur: v.purchasePriceEur, purchaseDate: v.purchaseDate, supplier: v.supplier } : {}),
    }).map(([k, val]) => [k, val === null || val === undefined ? "" : String(val)]),
  );

  // Margem = preço (ou valor da venda) − compra − custos; sem preço (sob consulta) não há margem a mostrar.
  const [costTotal] = canCosts ? await db.select({ total: sum(schema.vehicleCosts.amountEur) }).from(schema.vehicleCosts).where(eq(schema.vehicleCosts.vehicleId, v.id)) : [];
  const sellPrice = v.status === "sold" ? (v.soldPriceEur ?? v.priceEur) : v.priceOnRequest ? null : v.priceEur;
  const margin = canCosts && v.purchasePriceEur && sellPrice ? sellPrice - v.purchasePriceEur - Number(costTotal?.total ?? 0) : null;
  // Percurso do carro: entrada → preparação → legalização → destino.
  const [docCount] = await db
    .select({ n: count() })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerType, "vehicle"), eq(schema.documents.ownerId, v.id)));
  const legalization = await vehicleLegalization(v.id);
  const rented = (await activeRentalVehicleIds()).has(v.id);

  return (
    <div className="a-page">
      <div>
        <Link href={sec.base} className="a-crumb">
          <ArrowLeft size={14} /> {sec.crumb}
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
              <span className="a-role">{sec.label}</span>
              {v.priceOnRequest && v.status !== "sold" ? (
                <span className="a-price">Sob consulta</span>
              ) : v.priceEur ? (
                <span className="a-price num">{eur.format(v.status === "sold" && v.soldPriceEur ? v.soldPriceEur : v.priceEur)}</span>
              ) : null}
              {margin !== null && <span className={`a-pill plain ${margin >= 0 ? "available" : "danger"}`}>Margem {eur.format(margin)}</span>}
              <span>
                No stand há {daysSince(v.createdAt)} dias
                {buyer ? ` · Cliente: ${buyer.fullName}` : ""}
              </span>
              {v.section === "site" && v.published && v.status !== "preparation" && (
                <a href={`/#${v.slug}`} target="_blank" rel="noopener" className="a-link" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  Ver no site <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <CarJourney
        vehicleId={v.id}
        base={base}
        photos={gallery.length}
        docs={Number(docCount?.n ?? 0)}
        status={v.status}
        section={v.section}
        published={v.published}
        gaps={gaps}
        rented={rented}
        ptPlate={isPtPlate(v.plate)}
        legalization={legalization}
        canLegalize={canForms}
      />

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
        onSite={v.section === "site"}
      />
      {(can(user, "vehicles.status") || can(user, "vehicles.delete")) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
          {can(user, "vehicles.status") ? <SectionMover vehicleId={v.id} section={v.section} /> : <span />}
          {can(user, "vehicles.delete") && <DeleteVehicle id={v.id} label={`${v.make} ${v.model}`} back={sec.base} />}
        </div>
      )}

      <nav className="a-tabs" aria-label="Secções da viatura">
        {TABS.filter((t) => (t.key === "documentos" ? canDocs : t.key === "custos" ? canCosts : t.key === "aluguer" ? canForms && can(user, "vehicles.status") : t.key === "termos" || t.key === "venda" ? canForms : true)).map((t) => (
          <Link key={t.key} href={`${base}?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} scroll={false}>
            {t.label}
            {t.key === "fotos" && <span className="a-tab-count">{gallery.length}</span>}
          </Link>
        ))}
      </nav>

      {tab === "dados" &&
        (can(user, "vehicles.edit") ? (
          <VehicleForm id={v.id} initial={initial} canCosts={canCosts} section={v.section} />
        ) : (
          <section className="a-card a-card-pad">
            <dl className="a-dl">
              {Object.entries(initial).filter(([k, val]) => val && k !== "priceOnRequest" && k !== "onOrder").map(([k, val]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{FIELD_LABEL[k] ?? k}</dt>
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

      {tab === "documentos" && canForms && <GeneratedHistory history={await formHistory({ vehicleId: v.id })} title="Documentos gerados (garantia, declarações, contratos)" />}

      {tab === "documentos" && canDocs && (
        <DocumentsPanel owner={{ type: "vehicle", id: v.id }} docs={await documentsFor("vehicle", v.id)} kinds={VEHICLE_DOCUMENT_KINDS} canUpload={can(user, "documents.upload")} />
      )}

      {tab === "documentos" && canDocs && legalization && (
        <section className="a-card">
          <div className="a-card-head">
            <div>
              <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Stamp size={17} aria-hidden="true" /> Documentos da legalização
              </h2>
              <p>
                {STAGE_LABEL[legalization.stage]} · Modelo 9, DAV, registo e o que foi juntado no processo.
              </p>
            </div>
            <Link href={`/painel/legalizacao/${legalization.id}?etapa=documentos`} className="a-btn a-btn-sm">
              Abrir legalização
            </Link>
          </div>
          {legalization.docs.length ? (
            <div className="a-docs">
              {legalization.docs.map((d) => (
                <a key={d.id} className="a-doc" href={`/api/admin/files/${d.fileId}`} target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "none" }}>
                  <span className="a-doc-icon" aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong>{DOCUMENT_KINDS[d.kind as keyof typeof DOCUMENT_KINDS] ?? d.label}</strong>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name} · {dateTime(d.createdAt)}
                    </small>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="a-empty">
              <strong>Ainda sem documentos na legalização.</strong>
            </div>
          )}
        </section>
      )}

      {tab === "venda" && canForms && <GeneratedHistory history={await formHistory({ vehicleId: v.id })} title="Documentos desta venda" />}

      {tab === "venda" && canForms && <VehicleSale vehicleId={v.id} user={user} />}

      {tab === "venda" && can(user, "billing.manage") && <ChargesForVehicle vehicleId={v.id} />}

      {tab === "aluguer" && <RentalsCard rentals={await vehicleRentals(v.id)} canEdit={can(user, "vehicles.status")} />}

      {tab === "aluguer" && can(user, "vehicles.status") && canForms && (
        <SalePanel
          mode="rent"
          vehicleId={v.id}
          vehicleLabel={`${v.make} ${v.model}`}
          customers={customers}
          documents={(await templateInfos()).filter((t) => t.mode === "rent")}
          defaults={{ customerId: null, priceEur: v.soldPriceEur ?? v.priceEur, km: v.mileageKm }}
          sold={v.status === "sold" ? { buyer: buyer?.fullName ?? null, date: v.soldAt ? v.soldAt.toLocaleDateString("pt-PT") : null } : null}
          canMarkSold={can(user, "vehicles.status")}
          canCreateCustomer={can(user, "customers.edit")}
        />
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

      {tab === "custos" && canCosts && (
        <CostsCard vehicle={v} canEditPurchase={can(user, "vehicles.edit")} />
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

    </div>
  );
}

async function CostsCard({ vehicle, canEditPurchase }: { vehicle: typeof schema.vehicles.$inferSelect; canEditPurchase: boolean }) {
  const costs = await db
    .select({ id: schema.vehicleCosts.id, date: schema.vehicleCosts.date, category: schema.vehicleCosts.category, description: schema.vehicleCosts.description, amountEur: schema.vehicleCosts.amountEur })
    .from(schema.vehicleCosts)
    .where(eq(schema.vehicleCosts.vehicleId, vehicle.id))
    .orderBy(asc(schema.vehicleCosts.date));
  return (
    <CostsPanel
      vehicleId={vehicle.id}
      summary={costSummary(vehicle, costs)}
      costs={costs}
      canEditPurchase={canEditPurchase}
      info={{
        title: [vehicle.make, vehicle.model, vehicle.version].filter(Boolean).join(" "),
        plate: vehicle.plate,
        vin: vehicle.vin,
        year: vehicle.year,
        km: vehicle.mileageKm,
        fuel: vehicle.fuel ? FUEL[vehicle.fuel] : null,
        color: vehicle.color,
        supplier: vehicle.supplier,
        purchaseDate: vehicle.purchaseDate,
        notes: vehicle.costNotes,
      }}
    />
  );
}

/** Na aba Venda: a mesma Compra e venda da página própria, ligada a este carro. */
async function VehicleSale({ vehicleId, user }: { vehicleId: string; user: SessionUser }) {
  const row = await latestVehicleRegistration(vehicleId);
  if (!row)
    return (
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Compra e venda</h2>
            <p>A mesma da página Compra e venda: documentos lidos com IA, comprador, vendedor, fiador, requerimento do IRN, pagamento e declarações (garantia, circulação…).</p>
          </div>
        </div>
        <div className="a-card-body">
          <StartVehicleRegistration vehicleId={vehicleId} />
        </div>
      </section>
    );
  const props = await registrationEditorProps(row, user);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="a-actions" style={{ justifyContent: "space-between" }}>
        <h2 className="a-section-title" style={{ margin: 0 }}>
          Compra e venda
        </h2>
        <Link href={`/painel/registo/${row.id}`} className="a-btn a-btn-sm">
          Abrir em página própria
        </Link>
      </div>
      <RegistrationEditor {...props} embedded />
    </div>
  );
}

/** Na aba Venda: vendas a prestações deste carro e o atalho para criar uma (financiada pelo stand). */
async function ChargesForVehicle({ vehicleId }: { vehicleId: string }) {
  const contracts = await chargeContractsFor({ vehicleId });
  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Venda a prestações</h2>
          <p>Quando o próprio stand financia: dívida, prestações e cobranças pelo WhatsApp.</p>
        </div>
        <Link href={`/painel/cobrancas/nova?viatura=${vehicleId}`} className="a-btn a-btn-sm a-btn-primary">
          Nova venda a prestações
        </Link>
      </div>
      {contracts.length > 0 && (
        <div className="a-docs">
          {contracts.map((ch) => (
            <Link key={ch.id} href={`/painel/cobrancas/${ch.id}`} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", color: "inherit", textDecoration: "none" }}>
              <span style={{ minWidth: 0 }}>
                <strong>{holderNames(ch)}</strong>
                <small style={{ display: "block" }}>
                  Falta {money(ch.balance)} de {money(ch.toCollect)}
                </small>
              </span>
              <span className={`a-pill ${ch.status === "atrasado" ? "danger" : ch.status === "quitado" ? "neutral" : "available"}`}>{CONTRACT_STATUS_LABEL[ch.status]}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
