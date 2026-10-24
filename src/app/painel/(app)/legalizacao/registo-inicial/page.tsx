import Link from "next/link";
import { inArray } from "drizzle-orm";
import { ChevronLeft, FileCheck2, Search } from "lucide-react";
import { schema } from "@/db";
import { newLegalization } from "@/app/painel/_actions/legalizations";
import { Plate } from "@/components/painel/ui";
import { regTypeLabel, STAGE_PILL, STAGE_SHORT } from "@/lib/legalizacao";
import { requirePagePermission } from "@/server/auth/session";
import { legalCars, legalClientOptions } from "@/server/legalization";

export const metadata = { title: "Registo inicial" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[-\s·]/g, "");
const br = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

export default async function RegistoInicialPage(props: PageProps<"/painel/legalizacao/registo-inicial">) {
  await requirePagePermission("forms.generate");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const [cars, clients] = await Promise.all([legalCars(inArray(schema.legalizations.stage, ["registo", "concluido"])), legalClientOptions()]);
  const nq = norm(q);
  const list = nq ? cars.filter((c) => norm([c.ptPlate, c.holderName, c.title, c.vin, c.clientName ?? "", c.regNumber].join(" ")).includes(nq)) : cars;
  const pending = list.filter((c) => !c.regDate);
  const done = list.filter((c) => c.regDate).sort((a, b) => b.regDate.localeCompare(a.regDate));

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/legalizacao" className="a-crumb">
        <ChevronLeft size={15} /> Legalização
      </Link>
      <div className="a-head">
        <div>
          <h1>Registo inicial</h1>
          <p>Matrícula portuguesa no IMT e registo de propriedade (conservatória ou Automóvel Online). Procure pela matrícula, titular ou VIN.</p>
        </div>
      </div>

      <section className="a-card">
        <form action={newLegalization} className="a-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <div className="a-field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="reg-client">Cliente</label>
            <select id="reg-client" name="clientId" className="a-input" defaultValue="">
              <option value="">Novo cliente — pelos documentos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="stage" value="registo" />
          <button type="submit" className="a-btn a-btn-primary">
            <FileCheck2 size={16} /> Novo registo inicial
          </button>
        </form>
      </section>

      <form className="a-search" role="search">
        <Search size={16} aria-hidden="true" />
        <input className="a-input" name="q" defaultValue={q} placeholder="Matrícula, titular, VIN ou nº" aria-label="Procurar registos" />
      </form>

      {pending.length > 0 && (
        <section className="a-card" style={{ padding: 0 }}>
          <div className="a-client-head">
            <strong>Por registar</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {pending.length}
            </span>
          </div>
          {pending.map((c) => (
            <Link key={c.id} href={`/painel/legalizacao/${c.id}?etapa=registo`} className="a-legal-row">
              <span style={{ minWidth: 0 }}>
                <strong>{c.title}</strong>
                <small>{[c.clientName, c.sub].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="a-legal-pills">
                {c.ptPlate ? <Plate value={c.ptPlate} /> : <span className="a-pill neutral">Sem matrícula</span>}
                <span className={`a-pill ${STAGE_PILL[c.stage]}`}>{STAGE_SHORT[c.stage]}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {done.length ? (
        <section className="a-card" style={{ padding: 0 }}>
          <div className="a-client-head">
            <strong>Registos feitos</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {done.length}
            </span>
          </div>
          {done.map((c) => (
            <Link key={c.id} href={`/painel/legalizacao/${c.id}?etapa=registo`} className="a-legal-row">
              <span style={{ minWidth: 0 }}>
                <strong>{c.holderName || c.clientName || "Titular por preencher"}</strong>
                <small>{[c.title, br(c.regDate), regTypeLabel(c.regType).split(" (")[0], c.regNumber ? `nº ${c.regNumber}` : ""].filter(Boolean).join(" · ")}</small>
              </span>
              <span className="a-legal-pills">{c.ptPlate ? <Plate value={c.ptPlate} /> : <span className="a-pill neutral">Sem matrícula</span>}</span>
            </Link>
          ))}
        </section>
      ) : (
        pending.length === 0 && (
          <div className="a-card a-empty">
            <strong>{q ? "Nenhum registo corresponde à pesquisa." : "Ainda não há registos iniciais."}</strong>
            <span className="muted">Os carros aparecem aqui quando passam para a etapa Registo inicial.</span>
          </div>
        )
      )}
    </div>
  );
}
