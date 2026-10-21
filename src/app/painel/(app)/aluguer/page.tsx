import Link from "next/link";
import { Car, KeyRound, Plus } from "lucide-react";
import { RentalHistory, RentalRow } from "@/components/painel/rentals";
import { Plate } from "@/components/painel/ui";
import { eur, int } from "@/lib/labels";
import { lisbonDateTime } from "@/lib/rentals";
import { can, requirePagePermission } from "@/server/auth/session";
import { rentalFleet, rentalsOverview } from "@/server/rentals";
import { publicUrl } from "@/server/storage";
import { db, schema } from "@/db";
import { asc, eq, inArray } from "drizzle-orm";

export const metadata = { title: "Aluguer" };

export default async function RentalsPage() {
  const user = await requirePagePermission("vehicles.view");
  const canEdit = can(user, "vehicles.status");
  const canRent = can(user, "forms.generate");
  const o = await rentalsOverview();
  const fleet = await rentalFleet();
  const covers = fleet.length
    ? await db
        .select({ id: schema.vehiclePhotos.id, v: schema.vehiclePhotos.vehicleId, key: schema.files.storageKey })
        .from(schema.vehiclePhotos)
        .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
        .where(inArray(schema.vehiclePhotos.vehicleId, fleet.map((f) => f.id)))
        .orderBy(asc(schema.vehiclePhotos.position))
    : [];
  const coverOf = (v: (typeof fleet)[number]) => {
    const own = covers.filter((c) => c.v === v.id);
    const c = own.find((p) => p.id === v.coverPhotoId) ?? own[0];
    return c ? publicUrl(c.key) : null;
  };
  const activeOf = (id: string) => o.active.find((r) => r.vehicleId === id && r.state !== "agendado");

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Aluguer</h1>
          <p>Os carros da casa que estão alugados: quem está com cada um, até quando, e a devolução. Estes carros não aparecem no site.</p>
        </div>
        {can(user, "vehicles.edit") && (
          <Link href="/painel/viaturas/nova?seccao=aluguer" className="a-btn a-btn-primary">
            <Plus size={16} /> Adicionar carro à frota
          </Link>
        )}
      </div>

      <div className="a-stats is-money">
        <div className="a-stat">
          <span>Alugados agora</span>
          <strong>{o.totals.out}</strong>
          <small>
            {fleet.length} carro{fleet.length === 1 ? "" : "s"} na frota · {Math.max(0, fleet.length - fleet.filter((f) => activeOf(f.id)).length)} livre(s)
          </small>
        </div>
        <div className="a-stat">
          <span>Devolução em atraso</span>
          <strong className={o.totals.late ? "is-bad" : ""}>{o.totals.late}</strong>
        </div>
        <div className="a-stat">
          <span>Devolvem hoje</span>
          <strong>{o.totals.today}</strong>
        </div>
        <div className="a-stat">
          <span>Alugueres este mês</span>
          <strong className="is-good">{eur.format(o.totals.monthEur)}</strong>
        </div>
      </div>

      <div className="a-split">
        <div className="a-split-col is-first-mobile">
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Alugados agora</h2>
              </div>
              {o.active.length > 0 && <span className="a-pill plain">{o.active.length}</span>}
            </div>
            {o.active.length ? (
              <div className="a-docs">
                {o.active.map((r) => (
                  <RentalRow key={r.id} r={r} canEdit={canEdit} />
                ))}
              </div>
            ) : (
              <div className="a-empty">
                <strong>Nenhum carro alugado neste momento.</strong>
                {canRent && fleet.length > 0 && <span className="muted">Para alugar, abra o carro na frota e use “Alugar”.</span>}
              </div>
            )}
          </section>
        </div>

        <div className="a-split-col">
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Frota de aluguer</h2>
                <p>Carros da casa só para alugar</p>
              </div>
            </div>
            {fleet.length ? (
              <div className="a-stock">
                {fleet.map((v) => {
                  const r = activeOf(v.id);
                  const photo = coverOf(v);
                  return (
                    <div key={v.id} className="a-stock-item">
                      <Link href={`/painel/estoque/${v.id}`} className="a-stock-photo" aria-label={`Abrir ${v.make} ${v.model}`}>
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photo} alt="" loading="lazy" />
                        ) : (
                          <Car size={24} />
                        )}
                      </Link>
                      <span className="a-stock-main">
                        <span className="a-stock-title">
                          <Link href={`/painel/estoque/${v.id}`} style={{ color: "inherit" }}>
                            <strong>
                              {v.make} {v.model}
                            </strong>
                          </Link>
                          {v.plate && <Plate value={v.plate} />}
                        </span>
                        <small className="muted">{[v.version, v.year, v.mileageKm != null ? `${int.format(v.mileageKm)} km` : null].filter(Boolean).join(" · ")}</small>
                        <span className="a-stock-tags">
                          {r ? (
                            <span className={`a-pill ${r.state === "atrasado" ? "danger" : "reserved"}`}>
                              {r.state === "atrasado" ? "Devolução em atraso" : `Alugado até ${lisbonDateTime(new Date(r.endAt))}`}
                            </span>
                          ) : (
                            <span className="a-pill available">Livre</span>
                          )}
                          {r && <span className="muted" style={{ fontSize: 12.5 }}>{r.customer}</span>}
                        </span>
                      </span>
                      {!r && canRent && (
                        <Link href={`/painel/estoque/${v.id}?tab=aluguer`} className="a-btn a-btn-sm a-btn-primary" style={{ alignSelf: "center" }}>
                          <KeyRound size={14} /> Alugar
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="a-empty">
                <strong>A frota ainda está vazia.</strong>
                <span className="muted">No Estoque, abra um carro e escolha a função “Aluguer”, ou adicione um carro novo à frota.</span>
              </div>
            )}
          </section>
        </div>
      </div>

      <RentalHistory rentals={o.history} />
    </div>
  );
}
