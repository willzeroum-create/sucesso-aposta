import Link from "next/link";
import { desc } from "drizzle-orm";
import { FileCheck2, FilePlus2, FileSignature } from "lucide-react";
import { db, schema } from "@/db";
import { newRegistration } from "@/app/painel/_actions/registrations";
import { REGISTRATION_STATUS, type RegistrationStatus } from "@/lib/registo";
import { requirePagePermission } from "@/server/auth/session";
import { vehicleOptions } from "@/server/queries";

export const metadata = { title: "Compra e venda" };

const PILL: Record<RegistrationStatus, string> = { draft: "preparation", generated: "reserved", submitted: "accent", done: "available" };

export default async function RegistrationsPage() {
  await requirePagePermission("forms.generate");
  const rows = await db.select().from(schema.registrations).orderBy(desc(schema.registrations.updatedAt)).limit(200);
  const vehicles = await vehicleOptions(true);

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Compra e venda</h1>
          <p>Requerimento de Registo Automóvel do IRN: fotografe o documento do comprador e o do vendedor, confira e saia com o requerimento oficial preenchido, pronto a assinar.</p>
        </div>
      </div>

      <section className="a-card">
        <form action={newRegistration} className="a-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <div className="a-field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="new-reg-vehicle">Viatura do stock (opcional)</label>
            <select id="new-reg-vehicle" name="vehicleId" className="a-input" defaultValue="">
              <option value="">Outra viatura — começar pelas fotos</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="a-btn a-btn-primary">
            <FilePlus2 size={16} /> Nova compra e venda
          </button>
        </form>
      </section>

      {rows.length ? (
        <section className="a-card">
          <div className="a-docs">
            {rows.map((r) => {
              const v = r.vehicle ?? {};
              const title = [v.plate, [v.make, v.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Viatura por identificar";
              return (
                <Link key={r.id} href={`/painel/registo/${r.id}`} className="a-doc" style={{ color: "inherit", textDecoration: "none" }}>
                  <span className="a-doc-icon" aria-hidden="true">
                    {r.generatedFileId ? <FileCheck2 size={18} /> : <FileSignature size={18} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong>{title}</strong>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.seller?.name || "Vendedor por indicar"} → {r.buyer?.name || "comprador por indicar"}
                    </small>
                  </span>
                  <span className={`a-pill ${PILL[r.status]}`}>{REGISTRATION_STATUS[r.status]}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="a-card a-empty">
          <strong>Ainda não há processos.</strong>
          <span className="muted">Carregue em “Nova compra e venda”.</span>
        </div>
      )}
    </div>
  );
}
