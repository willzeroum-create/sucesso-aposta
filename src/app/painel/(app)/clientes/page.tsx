import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import { db, schema } from "@/db";
import { dateOnly } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Clientes" };

export default async function CustomersPage(props: PageProps<"/painel/clientes">) {
  const user = await requirePagePermission("customers.view");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const pattern = `%${q.replace(/[%_]/g, "")}%`;
  const rows = await db
    .select()
    .from(schema.customers)
    .where(q ? or(ilike(schema.customers.fullName, pattern), ilike(schema.customers.nif, pattern), ilike(schema.customers.email, pattern), ilike(schema.customers.phone, pattern)) : undefined)
    .orderBy(desc(schema.customers.updatedAt))
    .limit(300);

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Clientes</h1>
          <p>Fichas de clientes e compradores, com documentos e termos.</p>
        </div>
        {can(user, "customers.edit") && (
          <Link href="/painel/clientes/novo" className="a-btn a-btn-primary">
            <Plus size={17} /> Gerar ficha de cliente
          </Link>
        )}
      </div>
      <form className="a-search" role="search">
        <Search size={16} aria-hidden="true" />
        <input className="a-input" name="q" defaultValue={q} placeholder="Nome, NIF, e-mail ou telefone" aria-label="Pesquisar clientes" />
      </form>
      <section className="a-card">
        {rows.length ? (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>NIF</th>
                  <th className="hide-sm">Contacto</th>
                  <th className="hide-sm">Localidade</th>
                  <th className="right">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/painel/clientes/${c.id}`} className="a-row-link">
                        {c.fullName}
                      </Link>
                    </td>
                    <td className="num">{c.nif ?? "—"}</td>
                    <td className="hide-sm muted">{c.phone ?? c.email ?? "—"}</td>
                    <td className="hide-sm muted">{c.city ?? "—"}</td>
                    <td className="right muted num">{dateOnly(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a-empty">
            <strong>{q ? "Nenhum cliente corresponde à pesquisa." : "Ainda não há clientes."}</strong>
            {q ? "Experimente o NIF ou parte do nome." : "Crie a primeira ficha a partir de uma fotografia do documento de identificação."}
          </div>
        )}
      </section>
    </div>
  );
}
