import Link from "next/link";
import { FilePlus2, FileCheck2, Search, UsersRound } from "lucide-react";
import { newLegalization } from "@/app/painel/_actions/legalizations";
import { LegalCarRows } from "@/components/painel/legal-cars";
import { isStage, STAGE_SHORT, STAGES, type Stage } from "@/lib/legalizacao";
import { requirePagePermission } from "@/server/auth/session";
import { legalCars, legalClientOptions, type LegalCarRow } from "@/server/legalization";
import { vehicleOptions } from "@/server/queries";

export const metadata = { title: "Legalização" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[-\s·]/g, "");

export default async function LegalizationsPage(props: PageProps<"/painel/legalizacao">) {
  await requirePagePermission("forms.generate");
  const sp = await props.searchParams;
  const filter: Stage | "risco" | "ativos" = sp.etapa === "risco" ? "risco" : isStage(sp.etapa) ? sp.etapa : "ativos";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const [all, clients, vehicles] = await Promise.all([legalCars(), legalClientOptions(), vehicleOptions(false)]);

  const atRisk = (c: LegalCarRow) => c.deadline.state === "atencao" || c.deadline.state === "atrasado";
  const counts = Object.fromEntries(STAGES.map((s) => [s, all.filter((c) => c.stage === s).length])) as Record<Stage, number>;
  const risk = all.filter(atRisk).length;
  const nq = norm(q);
  const cars = all
    .filter((c) => (filter === "risco" ? atRisk(c) : filter === "ativos" ? c.stage !== "concluido" : c.stage === filter))
    .filter((c) => !nq || norm([c.title, c.sub, c.clientName ?? "", c.ptPlate, c.vin, c.holderName].join(" ")).includes(nq));

  // Agrupar por cliente, pela ordem do carro mais recente.
  const groups: { id: string | null; name: string; cars: LegalCarRow[] }[] = [];
  for (const c of cars) {
    const g = groups.find((x) => x.id === c.clientId);
    if (g) g.cars.push(c);
    else groups.push({ id: c.clientId, name: c.clientName ?? "Sem cliente", cars: [c] });
  }
  const tabs: { key: string; label: string; n: number }[] = [
    { key: "ativos", label: "Em curso", n: all.length - counts.concluido },
    ...STAGES.map((s) => ({ key: s, label: STAGE_SHORT[s], n: counts[s] })),
    { key: "risco", label: "DAV em risco", n: risk },
  ];
  const link = (key: string) => `/painel/legalizacao${key === "ativos" ? "" : `?etapa=${key}`}${q ? `${key === "ativos" ? "?" : "&"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Legalização</h1>
          <p>Modelo 9 e homologação → Alfândega (DAV) → Registo inicial. Cada cliente com os carros que legalizámos e os documentos de cada carro.</p>
        </div>
        <div className="a-actions">
          <Link href="/painel/legalizacao/clientes" className="a-btn">
            <UsersRound size={16} /> Clientes
          </Link>
          <Link href="/painel/legalizacao/registo-inicial" className="a-btn">
            <FileCheck2 size={16} /> Registo inicial
          </Link>
        </div>
      </div>

      <section className="a-card">
        <form action={newLegalization} className="a-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <div className="a-field" style={{ flex: "1 1 220px" }}>
            <label htmlFor="new-client">Cliente</label>
            <select id="new-client" name="clientId" className="a-input" defaultValue="">
              <option value="">Novo cliente — pelos documentos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="a-field" style={{ flex: "1 1 220px" }}>
            <label htmlFor="new-vehicle">Viatura do stock (opcional)</label>
            <select id="new-vehicle" name="vehicleId" className="a-input" defaultValue="">
              <option value="">Carro novo — começar pelo livrete</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="stage" value="modelo9" />
          <button type="submit" className="a-btn a-btn-primary">
            <FilePlus2 size={16} /> Novo carro
          </button>
        </form>
      </section>

      <nav className="a-tabs" aria-label="Filtrar por etapa">
        {tabs.map((t) => (
          <Link key={t.key} href={link(t.key)} aria-current={filter === t.key ? "page" : undefined}>
            {t.label} <span className="a-tab-count">{t.n}</span>
          </Link>
        ))}
      </nav>

      <form className="a-search" role="search">
        {filter !== "ativos" && <input type="hidden" name="etapa" value={filter} />}
        <Search size={16} aria-hidden="true" />
        <input className="a-input" name="q" defaultValue={q} placeholder="Cliente, marca, matrícula ou VIN" aria-label="Procurar carros" />
      </form>

      {groups.length ? (
        <section className="a-card" style={{ padding: 0 }}>
          {groups.map((g) => (
            <div key={g.id ?? "sem"} className="a-client-group">
              <div className="a-client-head">
                {g.id ? <Link href={`/painel/legalizacao/clientes/${g.id}`}>{g.name}</Link> : <strong>{g.name}</strong>}
                <span className="muted" style={{ fontSize: 13 }}>
                  {g.cars.length} carro{g.cars.length === 1 ? "" : "s"}
                </span>
              </div>
              <LegalCarRows cars={g.cars} />
            </div>
          ))}
        </section>
      ) : (
        <div className="a-card a-empty">
          <strong>{q ? "Nenhum carro corresponde à pesquisa." : filter === "risco" ? "Nenhuma DAV em risco." : "Ainda não há carros aqui."}</strong>
          <span className="muted">Carregue em “Novo carro” e fotografe o livrete com o telemóvel.</span>
        </div>
      )}
    </div>
  );
}
