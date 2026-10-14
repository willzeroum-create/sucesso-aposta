import Link from "next/link";
import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { ArrowUpRight, CalendarClock, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { Plate, StatusPill } from "@/components/painel/ui";
import { daysSince, eur, LEAD_INTENT, relative } from "@/lib/labels";
import { can, requireUser } from "@/server/auth/session";
import { aiProvider } from "@/server/ai/provider";

export const metadata = { title: "Início" };

export default async function Home() {
  const user = await requireUser();
  const seeVehicles = can(user, "vehicles.view");
  const seeLeads = can(user, "leads.view");
  const seeAudit = can(user, "audit.view");

  const counts = seeVehicles
    ? await db.select({ status: schema.vehicles.status, n: sql<number>`count(*)`, value: sql<number>`coalesce(sum(${schema.vehicles.priceEur}), 0)` }).from(schema.vehicles).groupBy(schema.vehicles.status)
    : [];
  const by = (s: string) => counts.find((c) => c.status === s);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [soldMonth] = seeVehicles
    ? await db.select({ n: sql<number>`count(*)` }).from(schema.vehicles).where(and(eq(schema.vehicles.status, "sold"), gte(schema.vehicles.soldAt, monthStart)))
    : [{ n: 0 }];

  const newLeads = seeLeads
    ? await db.select().from(schema.leads).where(eq(schema.leads.status, "new")).orderBy(desc(schema.leads.createdAt)).limit(6)
    : [];
  const [leadCount] = seeLeads ? await db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(eq(schema.leads.status, "new")) : [{ n: 0 }];

  const preparing = seeVehicles
    ? await db.select().from(schema.vehicles).where(eq(schema.vehicles.status, "preparation")).orderBy(schema.vehicles.createdAt).limit(6)
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
  const activity = seeAudit ? await db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(8) : [];
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
            <span>Disponíveis</span>
            <strong>{Number(by("available")?.n ?? 0)}</strong>
            <small>{eur.format(Number(by("available")?.value ?? 0))} em stock</small>
          </Link>
          <Link href="/painel/viaturas?estado=preparation" className="a-stat">
            <span>Em preparação</span>
            <strong>{Number(by("preparation")?.n ?? 0)}</strong>
            <small>fora do site</small>
          </Link>
          <Link href="/painel/viaturas?estado=reserved" className="a-stat">
            <span>Reservadas</span>
            <strong>{Number(by("reserved")?.n ?? 0)}</strong>
            <small>a aguardar fecho</small>
          </Link>
          <Link href="/painel/viaturas?estado=sold" className="a-stat">
            <span>Vendidas este mês</span>
            <strong>{Number(soldMonth?.n ?? 0)}</strong>
            <small>{Number(by("sold")?.n ?? 0)} no total</small>
          </Link>
        </div>
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
                <p>Viaturas que ainda não estão à venda no site</p>
              </div>
            </div>
            {preparing.length ? (
              <table className="a-table">
                <tbody>
                  {preparing.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link href={`/painel/viaturas/${v.id}`} className="a-row-link">
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
                      <Link href={`/painel/viaturas/${v.id}`} className="a-row-link">
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

        {seeAudit && (
          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>Atividade recente</h2>
                <p>Quem fez o quê</p>
              </div>
              <Link href="/painel/atividade" className="a-btn a-btn-sm">
                Ver tudo
              </Link>
            </div>
            {activity.length ? (
              <table className="a-table">
                <tbody>
                  {activity.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong style={{ fontWeight: 600 }}>{a.userName}</strong> <span className="muted">{a.summary}</span>
                      </td>
                      <td className="right muted" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                        {relative(a.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="a-empty">Ainda sem atividade registada.</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
