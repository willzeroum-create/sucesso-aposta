import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { Building2, ChevronLeft, Search, User } from "lucide-react";
import { db, schema } from "@/db";
import { LegalClientForm } from "@/components/painel/legal-client-form";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Clientes da legalização" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export default async function LegalClientsPage(props: PageProps<"/painel/legalizacao/clientes">) {
  await requirePagePermission("forms.generate");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const novo = sp.novo === "1";
  const rows = await db
    .select({
      id: schema.legalClients.id,
      name: schema.legalClients.name,
      nif: schema.legalClients.nif,
      kind: schema.legalClients.kind,
      city: schema.legalClients.city,
      cars: count(schema.legalizations.id),
      done: sql<number>`count(*) filter (where ${schema.legalizations.stage} = 'concluido')`.mapWith(Number),
    })
    .from(schema.legalClients)
    .leftJoin(schema.legalizations, eq(schema.legalizations.clientId, schema.legalClients.id))
    .groupBy(schema.legalClients.id)
    .orderBy(asc(schema.legalClients.name));
  const nq = norm(q);
  const list = nq ? rows.filter((r) => norm(`${r.name} ${r.nif ?? ""} ${r.city ?? ""}`).includes(nq)) : rows;

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/legalizacao" className="a-crumb">
        <ChevronLeft size={15} /> Legalização
      </Link>
      <div className="a-head">
        <div>
          <h1>Clientes da legalização</h1>
          <p>Empresas e particulares em nome de quem legalizamos carros. Dentro de cada cliente ficam os carros e os documentos.</p>
        </div>
        {!novo && (
          <Link href="/painel/legalizacao/clientes?novo=1" className="a-btn a-btn-primary">
            Novo cliente
          </Link>
        )}
      </div>

      {novo && <LegalClientForm />}

      <form className="a-search" role="search">
        <Search size={16} aria-hidden="true" />
        <input className="a-input" name="q" defaultValue={q} placeholder="Nome, NIF ou localidade" aria-label="Procurar clientes" />
      </form>

      {list.length ? (
        <section className="a-card" style={{ padding: 0 }}>
          {list.map((c) => (
            <Link key={c.id} href={`/painel/legalizacao/clientes/${c.id}`} className="a-legal-row">
              <span style={{ minWidth: 0, display: "flex", gap: 10, alignItems: "center" }}>
                <span className="a-doc-icon" aria-hidden="true">
                  {c.kind === "empresa" ? <Building2 size={18} /> : <User size={18} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong>{c.name}</strong>
                  <small>{[c.nif ? `NIF ${c.nif}` : "Sem NIF", c.city].filter(Boolean).join(" · ")}</small>
                </span>
              </span>
              <span className="a-legal-pills">
                <span className="a-pill plain">
                  {c.cars} carro{c.cars === 1 ? "" : "s"}
                </span>
                {c.done > 0 && <span className="a-pill available">{c.done} concluído{c.done === 1 ? "" : "s"}</span>}
              </span>
            </Link>
          ))}
        </section>
      ) : (
        <div className="a-card a-empty">
          <strong>{q ? "Nenhum cliente corresponde à pesquisa." : "Ainda não há clientes."}</strong>
          <span className="muted">Os clientes também se criam sozinhos ao preencher o requerente de um carro.</span>
        </div>
      )}
    </div>
  );
}
