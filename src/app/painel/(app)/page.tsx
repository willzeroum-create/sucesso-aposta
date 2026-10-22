import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { ArrowUpRight, CalendarClock, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { Plate, StatusPill } from "@/components/painel/ui";
import { daysSince, eur, eur2, LEAD_INTENT, relative } from "@/lib/labels";
import { SECTIONS } from "@/lib/sections";
import { chargesOverview } from "@/server/cobrancas";
import { rentalsOverview } from "@/server/rentals";
import { can, requireUser } from "@/server/auth/session";
import { aiProvider } from "@/server/ai/provider";

export const metadata = { title: "Início" };

export default async function Home() {
  const user = await requireUser();
  const seeVehicles = can(user, "vehicles.view");
  const seeLeads = can(user, "leads.view");

  // Contagens por secção: viaturas do site e estoque (venda + aluguer) nunca se misturam.
  const counts = seeVehicles
    ? await db
        .select({ section: schema.vehicles.section, status: schema.vehicles.status, published: schema.vehicles.published, n: sql<number>`count(*)::int` })
        .from(schema.vehicles)
        .groupBy(schema.vehicles.section, schema.vehicles.status, schema.vehicles.published)
    : [];
  const count = (f: (c: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((t, c) => t + Number(c.n), 0);
  const site = {
    online: count((c) => c.section === "site" && c.published && c.status !== "sold" && c.status !== "preparation"),
    preparing: count((c) => c.section === "site" && c.status === "preparation"),
    reserved: count((c) => c.section === "site" && c.status === "reserved"),
  };
  const stock = {
    sale: count((c) => c.section === "estoque" && c.status !== "sold"),
    rent: count((c) => c.section === "aluguer" && c.status !== "sold"),
  };
  const soldTotal = count((c) => c.status === "sold");
  const rentals = seeVehicles ? (await rentalsOverview()).totals : null;
  const charges = can(user, "billing.manage") ? (await chargesOverview()).totals : null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [soldMonth] = seeVehicles
    ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.vehicles).where(and(eq(schema.vehicles.status, "sold"), gte(schema.vehicles.soldAt, monthStart)))
    : [{ n: 0 }];

  const newLeads = seeLeads
    ? await db.select().from(schema.leads).where(eq(schema.leads.status, "new")).orderBy(desc(schema.leads.createdAt)).limit(6)
    : [];
  const [leadCount] = seeLeads ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(eq(schema.leads.status, "new")) : [{ n: 0 }];

  const preparing = seeVehicles
    ? await db
        .select()
        .from(schema.vehicles)
        .where(and(eq(schema.vehicles.status, "preparation"), eq(schema.vehicles.section, "site")))
        .orderBy(schema.vehicles.createdAt)
        .limit(6)
    : [];
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const inspections = seeVehicles
    ? await db
        .select()
        .from(schema.vehicles)
        .where(and(isNotNull(schema.vehicles.nextInspection), lte(schema.vehicles.nextInspection, in30), sql`${schema.vehicles.status} != 'sold'`))
        .orderBy(schema.vehicles.nextInspection)
        .limit(5)
    : [];
  // Contactos recebidos (site + registados pela equipa): hoje, 7 dias, este mês e origem do mês.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const countSince = async (d: Date) =>
    Number((await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(gte(schema.leads.createdAt, d)))[0]?.n ?? 0);
  const contacts = seeLeads
    ? {
        today: await countSince(startOfDay),
        week: await countSince(weekAgo),
        month: await countSince(monthStart),
        sources: await db
          .select({ source: sql<string>`coalesce(${schema.leads.utmSource}, ${schema.leads.source})`, n: sql<number>`count(*)::int` })
          .from(schema.leads)
          .where(gte(schema.leads.createdAt, monthStart))
          .groupBy(sql`1`)
          .orderBy(sql`2 desc`)
          .limit(4),
        won: Number((await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(and(eq(schema.leads.status, "won"), gte(schema.leads.updatedAt, monthStart))))[0]?.n ?? 0),
      }
    : null;
  const ai = aiProvider();
  const firstName = user.name.split(" ")[0];

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Olá, {firstName}</h1>
          <p>Resumo do stand e do que precisa de atenção hoje.</p>
        </div>
        {can(user, "vehicles.edit") && (
          <div className="a-actions">
            <Link href="/painel/viaturas/nova" className="a-btn a-btn-primary">
              <Plus size={17} /> Dar entrada de viatura
            </Link>
          </div>
        )}
      </div>

      {seeVehicles && (
        <div className="a-stats">
          <Link href="/painel/viaturas?estado=available" className="a-stat">
            <span>No site</span>
            <strong>{site.online}</strong>
            <small>
              {site.preparing} em preparação · {site.reserved} reservada{site.reserved === 1 ? "" : "s"}
            </small>
          </Link>
          <Link href="/painel/estoque" className="a-stat">
            <span>Estoque</span>
            <strong>{stock.sale + stock.rent}</strong>
            <small>
              {stock.sale} venda · {stock.rent} aluguer
            </small>
          </Link>
          <Link href="/painel/aluguer" className="a-stat">
            <span>Alugados agora</span>
            <strong>{rentals?.out ?? 0}</strong>
            <small className={rentals?.late ? "is-bad" : undefined}>{rentals?.late ? `${rentals.late} devolução em atraso` : "Nenhuma devolução em atraso"}</small>
          </Link>
          <Link href="/painel/viaturas?estado=sold" className="a-stat">
            <span>Vendidas este mês</span>
            <strong>{Number(soldMonth?.n ?? 0)}</strong>
            <small>{soldTotal} no total</small>
          </Link>
        </div>
      )}

      {charges && charges.late > 0 && (
        <Link href="/painel/cobrancas" className="a-alert a-alert-warn" style={{ color: "inherit", textDecoration: "none" }}>
          <CalendarClock size={18} />
          <p>
            <strong>Cobranças em atraso: {eur2.format(charges.late)}</strong> — abrir Cobranças para cobrar pelo WhatsApp.
          </p>
        </Link>
      )}

      {!ai && can(user, "documents.upload") && (
        <div className="a-alert a-alert-warn">
          <CalendarClock size={18} />
          <p>
            A leitura de documentos com IA ainda não está ligada. Defina <span className="a-code">GEMINI_API_KEY</span> ou{" "}
            <span className="a-code">ANTHROPIC_API_KEY</span> no servidor. Até lá, os dados preenchem-se à mão.
          </p>
        </div>
      )}

      <div className="a-grid-2">
        {seeLeads && (
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Pedidos por responder</h2>
                <p>{Number(leadCount?.n ?? 0)} novos pedidos do site</p>
              </div>
              <Link href="/painel/crm" className="a-btn a-btn-sm">
                Abrir CRM <ArrowUpRight size={15} />
              </Link>
            </div>
            {newLeads.length ? (
              <table className="a-table">
                <tbody>
                  {newLeads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/painel/crm/${l.id}`} className="a-row-link">
                          {l.fullName}
                        </Link>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {LEAD_INTENT[l.intent]}
                        </div>
                      </td>
                      <td className="right muted" style={{ fontSize: 13 }}>
                        {relative(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="a-empty">
                <strong>Tudo respondido.</strong>
                Os novos pedidos do formulário do site aparecem aqui.
              </div>
            )}
          </section>
        )}

        {seeVehicles && (
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Em preparação</h2>
                <p>Viaturas do site que ainda não estão publicadas</p>
              </div>
            </div>
            {preparing.length ? (
              <table className="a-table">
                <tbody>
                  {preparing.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link href={`${SECTIONS[v.section].base}/${v.id}`} className="a-row-link">
                          {v.make} {v.model}
                        </Link>
                        <div className="muted" style={{ fontSize: 13 }}>
                          há {daysSince(v.createdAt)} dias no stand
                        </div>
                      </td>
                      <td className="right">
                        <Plate value={v.plate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="a-empty">
                <strong>Nada em preparação.</strong>
                Quando uma viatura der entrada, começa aqui até ser publicada.
              </div>
            )}
          </section>
        )}

        {seeVehicles && inspections.length > 0 && (
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Inspeções a vencer</h2>
                <p>Próximos 30 dias</p>
              </div>
            </div>
            <table className="a-table">
              <tbody>
                {inspections.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`${SECTIONS[v.section].base}/${v.id}`} className="a-row-link">
                        {v.make} {v.model}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                    <td className="right num">{v.nextInspection?.split("-").reverse().join("/")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {contacts && (
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Contactos</h2>
                <p>Pedidos recebidos pelo site e registados pela equipa</p>
              </div>
            </div>
            <div className="a-stats" style={{ border: 0, borderBottom: "1px solid var(--line)", borderRadius: 0, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <div className="a-stat">
                <span>Hoje</span>
                <strong>{contacts.today}</strong>
              </div>
              <div className="a-stat">
                <span>Últimos 7 dias</span>
                <strong>{contacts.week}</strong>
              </div>
              <div className="a-stat">
                <span>Este mês</span>
                <strong>{contacts.month}</strong>
                <small>{contacts.won} convertido{contacts.won === 1 ? "" : "s"} em venda</small>
              </div>
            </div>
            {contacts.sources.length ? (
              <table className="a-table">
                <tbody>
                  {contacts.sources.map((s) => (
                    <tr key={s.source}>
                      <td>{s.source.charAt(0).toUpperCase() + s.source.slice(1)}</td>
                      <td className="right num">{Number(s.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="a-empty">Ainda sem contactos este mês.</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
