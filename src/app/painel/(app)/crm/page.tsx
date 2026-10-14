import Link from "next/link";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { Search } from "lucide-react";
import { db, schema } from "@/db";
import { LEAD_STATUSES } from "@/db/schema";
import { NewLeadButton } from "@/components/painel/lead-panel";
import { LEAD_INTENT, LEAD_STATUS, relative } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";
import { vehicleOptions } from "@/server/queries";

export const metadata = { title: "Pedidos (CRM)" };

export default async function CrmPage(props: PageProps<"/painel/crm">) {
  const user = await requirePagePermission("leads.view");
  const sp = await props.searchParams;
  const estado = typeof sp.estado === "string" && (LEAD_STATUSES as readonly string[]).includes(sp.estado) ? sp.estado : "abertos";
  const mine = sp.meus === "1";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";

  const where: SQL[] = [];
  if (estado === "abertos") where.push(sql`${schema.leads.status} not in ('won','lost')`);
  else where.push(eq(schema.leads.status, estado as (typeof LEAD_STATUSES)[number]));
  if (mine) where.push(eq(schema.leads.assignedTo, user.id));
  if (q) {
    const p = `%${q.replace(/[%_]/g, "")}%`;
    where.push(or(like(schema.leads.fullName, p), like(schema.leads.email, p), like(schema.leads.phone, p), like(schema.leads.message, p))!);
  }

  const rows = await db
    .select({ lead: schema.leads, assignee: schema.users.name, make: schema.vehicles.make, model: schema.vehicles.model })
    .from(schema.leads)
    .leftJoin(schema.users, eq(schema.users.id, schema.leads.assignedTo))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.leads.vehicleId))
    .where(and(...where))
    .orderBy(desc(schema.leads.createdAt))
    .limit(300);
  const counts = await db.select({ status: schema.leads.status, n: sql<number>`count(*)` }).from(schema.leads).groupBy(schema.leads.status);
  const n = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
  const open = LEAD_STATUSES.filter((s) => s !== "won" && s !== "lost").reduce((t, s) => t + n(s), 0);
  const href = (e: string) => `/painel/crm?estado=${e}${mine ? "&meus=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Pedidos (CRM)</h1>
          <p>Contactos do formulário do site e registados pela equipa.</p>
        </div>
        {can(user, "leads.edit") && <NewLeadButton vehicles={await vehicleOptions(false)} />}
      </div>

      <nav className="a-funnel" aria-label="Filtrar por fase">
        <Link href={href("abertos")} aria-current={estado === "abertos" ? "page" : undefined}>
          Em aberto <b>{open}</b>
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s} href={href(s)} aria-current={estado === s ? "page" : undefined}>
            {LEAD_STATUS[s]} <b>{n(s)}</b>
          </Link>
        ))}
      </nav>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <form className="a-search" role="search">
          <input type="hidden" name="estado" value={estado} />
          {mine && <input type="hidden" name="meus" value="1" />}
          <Search size={16} aria-hidden="true" />
          <input className="a-input" name="q" defaultValue={q} placeholder="Nome, e-mail, telefone ou mensagem" aria-label="Pesquisar pedidos" />
        </form>
        <Link href={`/painel/crm?estado=${estado}${mine ? "" : "&meus=1"}`} className={`a-btn a-btn-sm${mine ? " a-btn-primary" : ""}`} aria-pressed={mine}>
          Só os meus
        </Link>
      </div>

      <section className="a-card">
        {rows.length ? (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Motivo</th>
                  <th>Fase</th>
                  <th className="hide-sm">Responsável</th>
                  <th className="right">Recebido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ lead: l, assignee, make, model }) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/painel/crm/${l.id}`} className="a-row-link">
                        {l.fullName}
                      </Link>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {l.phone ?? l.email}
                      </div>
                    </td>
                    <td>
                      {LEAD_INTENT[l.intent]}
                      {make && (
                        <div className="muted" style={{ fontSize: 13 }}>
                          {make} {model}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`a-pill ${l.status === "new" ? "accent" : l.status === "won" ? "available" : l.status === "lost" ? "neutral" : "reserved"}`}>{LEAD_STATUS[l.status]}</span>
                    </td>
                    <td className="hide-sm muted">{assignee ?? "—"}</td>
                    <td className="right muted" style={{ whiteSpace: "nowrap" }}>
                      {relative(l.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a-empty">
            <strong>Sem pedidos nesta fase.</strong>
            Quando o site estiver em modo real, cada pedido do formulário aparece aqui com a viatura associada.
          </div>
        )}
      </section>
    </div>
  );
}
