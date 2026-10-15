import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FilePlus2, FileCheck2, Stamp } from "lucide-react";
import { db, schema } from "@/db";
import { newLegalization } from "@/app/painel/_actions/legalizations";
import { LEGALIZATION_STATUS, type LegalizationStatus } from "@/lib/modelo9";
import { requirePagePermission } from "@/server/auth/session";
import { vehicleOptions } from "@/server/queries";

export const metadata = { title: "Modelo 9 e homologação" };

const PILL: Record<LegalizationStatus, string> = { draft: "preparation", generated: "reserved", submitted: "accent", done: "available" };

export default async function LegalizationsPage() {
  await requirePagePermission("forms.generate");
  const rows = await db
    .select({
      id: schema.legalizations.id,
      status: schema.legalizations.status,
      vehicle: schema.legalizations.vehicle,
      requester: schema.legalizations.requester,
      modelo9FileId: schema.legalizations.modelo9FileId,
      updatedAt: schema.legalizations.updatedAt,
      stockMake: schema.vehicles.make,
      stockModel: schema.vehicles.model,
    })
    .from(schema.legalizations)
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.legalizations.vehicleId))
    .orderBy(desc(schema.legalizations.updatedAt))
    .limit(200);
  const vehicles = await vehicleOptions(false);

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Modelo 9 e homologação</h1>
          <p>Carros importados: fotografe o livrete estrangeiro e o documento do requerente, confira os dados e saia com o Modelo 9 do IMT preenchido e os dados da homologação prontos a copiar.</p>
        </div>
      </div>

      <section className="a-card">
        <form action={newLegalization} className="a-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <div className="a-field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="new-vehicle">Viatura do stock (opcional)</label>
            <select id="new-vehicle" name="vehicleId" className="a-input" defaultValue="">
              <option value="">Viatura nova — começar pelas fotos</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="a-btn a-btn-primary">
            <FilePlus2 size={16} /> Novo processo
          </button>
        </form>
      </section>

      {rows.length ? (
        <section className="a-card">
          <div className="a-docs">
            {rows.map((r) => {
              const v = r.vehicle ?? {};
              const title = [v.make || r.stockMake, v.model || r.stockModel].filter(Boolean).join(" ") || "Viatura por identificar";
              const sub = [v.foreignPlate, v.originCountry, v.vin].filter(Boolean).join(" · ");
              return (
                <Link key={r.id} href={`/painel/legalizacao/${r.id}`} className="a-doc" style={{ color: "inherit", textDecoration: "none" }}>
                  <span className="a-doc-icon" aria-hidden="true">
                    {r.modelo9FileId ? <FileCheck2 size={18} /> : <Stamp size={18} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong>{title}</strong>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sub || "Sem dados do livrete"}
                      {r.requester?.name ? ` — ${r.requester.name}` : ""}
                    </small>
                  </span>
                  <span className={`a-pill ${PILL[r.status]}`}>{LEGALIZATION_STATUS[r.status]}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="a-card a-empty">
          <strong>Ainda não há processos.</strong>
          <span className="muted">Carregue em “Novo processo” e fotografe os documentos com o telemóvel.</span>
        </div>
      )}
    </div>
  );
}
