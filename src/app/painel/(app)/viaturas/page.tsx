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

  const conditions: SQL[] = [];
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

  const totals = await db.select({ status: schema.vehicles.status, n: sql<number>`count(*)::int` }).from(schema.vehicles).groupBy(schema.vehicles.status);
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
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>
                    <span className="sr-only">Fotografia</span>
                  </th>
                  <th>Viatura</th>
                  <th>Matrícula</th>
                  <th>Estado</th>
                  <th className="hide-sm right">Km</th>
                  <th className="right">Preço</th>
                  {showCosts && <th className="hide-sm right">Compra</th>}
                  <th className="hide-sm right">Dias</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const cover = coverOf(v);
                  return (
                    <tr key={v.id}>
                      <td>
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover} alt="" className="a-thumb" loading="lazy" />
                        ) : (
                          <span className="a-thumb-empty">
                            <Car size={18} />
                          </span>
                        )}
                      </td>
                      <td>
                        <Link href={`/painel/viaturas/${v.id}`} className="a-row-link">
                          {v.make} {v.model}
                        </Link>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {[v.version, v.year].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td>
                        <Plate value={v.plate} />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <StatusPill status={v.status} />
                          {v.published && v.status !== "preparation" && (
                            <span title="Publicada no site" aria-label="Publicada no site" className="muted">
                              <Globe size={15} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hide-sm right num">{v.mileageKm != null ? int.format(v.mileageKm) : "—"}</td>
                      <td className="right num">{v.status === "sold" && v.soldPriceEur ? eur.format(v.soldPriceEur) : v.priceOnRequest ? <span className="muted">Sob consulta</span> : v.priceEur ? eur.format(v.priceEur) : "—"}</td>
                      {showCosts && <td className="hide-sm right num muted">{v.purchasePriceEur ? eur.format(v.purchasePriceEur) : "—"}</td>}
                      <td className="hide-sm right num muted">{daysSince(v.status === "sold" && v.soldAt ? v.soldAt : v.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
