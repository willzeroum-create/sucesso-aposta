import Link from "next/link";
import { and, asc, desc, eq, inArray, ilike, or, sql, type SQL } from "drizzle-orm";
import { Car, Globe, Plus, Search } from "lucide-react";
import { db, schema } from "@/db";
import { VEHICLE_STATUSES } from "@/db/schema";
import { Plate, StatusPill } from "@/components/painel/ui";
import { PartnerSync } from "@/components/painel/partner-sync";
import { daysSince, eur, int, VEHICLE_STATUS } from "@/lib/labels";
import { normalizePlate } from "@/lib/pt-validation";
import { can, requirePagePermission } from "@/server/auth/session";
import { publicUrl } from "@/server/storage";

export const metadata = { title: "Viaturas" };
export const maxDuration = 60;

export default async function VehiclesPage(props: PageProps<"/painel/viaturas">) {
  const user = await requirePagePermission("vehicles.view");
  const sp = await props.searchParams;
  const estado = typeof sp.estado === "string" && (VEHICLE_STATUSES as readonly string[]).includes(sp.estado) ? sp.estado : "stock";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";

  const conditions: SQL[] = [eq(schema.vehicles.section, "site")];
  if (estado === "stock") conditions.push(sql`${schema.vehicles.status} != 'sold'`);
  else conditions.push(eq(schema.vehicles.status, estado as (typeof VEHICLE_STATUSES)[number]));
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const plate = normalizePlate(q);
    conditions.push(
      or(
        ilike(schema.vehicles.make, pattern),
        ilike(schema.vehicles.model, pattern),
        ilike(schema.vehicles.version, pattern),
        ilike(schema.vehicles.vin, `%${plate}%`),
        plate.length >= 2 ? ilike(sql`replace(${schema.vehicles.plate}, '-', '')`, `%${plate}%`) : undefined,
      )!,
    );
  }

  const rows = await db
    .select()
    .from(schema.vehicles)
    .where(and(...conditions))
    .orderBy(estado === "sold" ? desc(schema.vehicles.soldAt) : asc(schema.vehicles.createdAt))
    .limit(500);

  const covers = rows.length
    ? await db
        .select({ id: schema.vehiclePhotos.id, vehicleId: schema.vehiclePhotos.vehicleId, key: schema.files.storageKey, position: schema.vehiclePhotos.position })
        .from(schema.vehiclePhotos)
        .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
        .where(inArray(schema.vehiclePhotos.vehicleId, rows.map((r) => r.id)))
        .orderBy(asc(schema.vehiclePhotos.position))
    : [];
  const coverOf = (v: (typeof rows)[number]) => {
    const own = covers.filter((c) => c.vehicleId === v.id);
    const c = own.find((p) => p.id === v.coverPhotoId) ?? own[0];
    return c ? publicUrl(c.key) : null;
  };

  const totals = await db.select({ status: schema.vehicles.status, n: sql<number>`count(*)::int` }).from(schema.vehicles).where(eq(schema.vehicles.section, "site")).groupBy(schema.vehicles.status);
  const n = (s: string) => Number(totals.find((t) => t.status === s)?.n ?? 0);
  const tabs = [
    { key: "stock", label: "Em stock", count: n("preparation") + n("available") + n("reserved") },
    ...VEHICLE_STATUSES.map((s) => ({ key: s, label: VEHICLE_STATUS[s].label, count: n(s) })),
  ];
  const showCosts = can(user, "vehicles.costs");

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Viaturas</h1>
          <p>Stock do stand. O estado e a publicação controlam o que aparece no site.</p>
        </div>
        {can(user, "vehicles.edit") && (
          <div className="a-actions">
            {can(user, "vehicles.status") && <PartnerSync />}
            <Link href="/painel/viaturas/nova" className="a-btn a-btn-primary">
              <Plus size={17} /> Dar entrada de viatura
            </Link>
          </div>
        )}
      </div>

      <nav className="a-tabs" aria-label="Filtrar por estado">
        {tabs.map((t) => (
          <Link key={t.key} href={`/painel/viaturas?estado=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={estado === t.key ? "page" : undefined}>
            {t.label} <span className="a-tab-count">{t.count}</span>
          </Link>
        ))}
      </nav>

      <form className="a-search" role="search">
        <input type="hidden" name="estado" value={estado} />
        <Search size={16} aria-hidden="true" />
        <input className="a-input" name="q" defaultValue={q} placeholder="Marca, modelo, matrícula ou VIN" aria-label="Pesquisar viaturas" />
      </form>

      <section className="a-card">
        {rows.length ? (
          // Cartões (como no Estoque): fotografia, nome, matrícula, estado, km e preço — leem-se bem no telemóvel.
          <div className="a-stock">
            {rows.map((v) => {
              const cover = coverOf(v);
              const price = v.status === "sold" && v.soldPriceEur ? eur.format(v.soldPriceEur) : v.priceOnRequest ? "Sob consulta" : v.priceEur ? eur.format(v.priceEur) : "Sem preço";
              return (
                <Link key={v.id} href={`/painel/viaturas/${v.id}`} className="a-stock-item">
                  <span className="a-stock-photo">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" loading="lazy" />
                    ) : (
                      <Car size={22} />
                    )}
                  </span>
                  <span className="a-stock-main">
                    <span className="a-stock-title">
                      <strong>
                        {v.make} {v.model}
                      </strong>
                      {v.plate ? <Plate value={v.plate} /> : <span className="a-pill neutral">Sem matrícula</span>}
                    </span>
                    <small className="muted">{[v.version, v.year, v.mileageKm != null ? `${int.format(v.mileageKm)} km` : null].filter(Boolean).join(" · ")}</small>
                    <span className="a-stock-tags">
                      <StatusPill status={v.status} />
                      {v.published && v.status !== "preparation" ? (
                        <span className="a-pill plain" title="Publicada no site">
                          <Globe size={13} /> No site
                        </span>
                      ) : (
                        <span className="a-pill neutral">Fora do site</span>
                      )}
                      {v.sourcePartner === "tampinha" && <span className="muted" style={{ fontSize: 12.5 }}>Tampinha Cars</span>}
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {daysSince(v.status === "sold" && v.soldAt ? v.soldAt : v.createdAt)} dias
                      </span>
                    </span>
                  </span>
                  <span className="a-stock-money">
                    <span>
                      <small>Preço</small>
                      <strong>{price}</strong>
                    </span>
                    {showCosts && (
                      <span>
                        <small>Compra</small>
                        <strong>{v.purchasePriceEur ? eur.format(v.purchasePriceEur) : "—"}</strong>
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="a-empty">
            <strong>{q ? "Nenhuma viatura corresponde à pesquisa." : "Ainda não há viaturas neste estado."}</strong>
            {q ? (
              <Link href={`/painel/viaturas?estado=${estado}`} className="a-link">
                Limpar a pesquisa
              </Link>
            ) : (
              "Use “Dar entrada de viatura” para registar a primeira: pode começar por fotografar o documento."
            )}
          </div>
        )}
      </section>
    </div>
  );
}
