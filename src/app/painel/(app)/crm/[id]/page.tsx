import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";
import { db, schema } from "@/db";
import { LeadControls } from "@/components/painel/lead-panel";
import { Plate } from "@/components/painel/ui";
import { dateTime, eur, LEAD_INTENT } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Pedido" };

export default async function LeadPage(props: PageProps<"/painel/crm/[id]">) {
  const user = await requirePagePermission("leads.view");
  const { id } = await props.params;
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id)).limit(1);
  if (!lead) notFound();
  const [vehicle] = lead.vehicleId ? await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, lead.vehicleId)).limit(1) : [];
  const events = await db.select().from(schema.leadEvents).where(eq(schema.leadEvents.leadId, id)).orderBy(desc(schema.leadEvents.createdAt));
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const wa = lead.phoneNormalized?.replace(/\D/g, "");

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <Link href="/painel/crm" className="a-crumb">
            <ArrowLeft size={14} /> Pedidos
          </Link>
          <h1>{lead.fullName}</h1>
          <p>
            {LEAD_INTENT[lead.intent]} · recebido {dateTime(lead.createdAt)} · origem: {lead.source}
            {lead.utmSource ? ` (${[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")})` : ""}
          </p>
        </div>
        <div className="a-actions">
          {lead.phone && (
            <a className="a-btn" href={`tel:${lead.phoneNormalized ?? lead.phone}`}>
              <Phone size={16} /> Ligar
            </a>
          )}
          {wa && (
            <a className="a-btn" href={`https://wa.me/${wa}`} target="_blank" rel="noopener">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          {lead.email && (
            <a className="a-btn" href={`mailto:${lead.email}`}>
              <Mail size={16} /> E-mail
            </a>
          )}
        </div>
      </div>

      <div className="a-split">
        <div style={{ display: "grid", gap: 20 }}>
          <section className="a-card a-card-pad" style={{ display: "grid", gap: 12 }}>
            <h2 className="a-section-title">Mensagem</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{lead.message}</p>
            <dl className="a-dl">
              <dt>E-mail</dt>
              <dd>{lead.email || "—"}</dd>
              <dt>Telefone</dt>
              <dd>{lead.phone || "—"}</dd>
              <dt>Consentimento</dt>
              <dd className="muted" style={{ fontSize: 13 }}>
                {lead.consentText} ({dateTime(lead.consentAt)})
              </dd>
            </dl>
          </section>
          {vehicle && (
            <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span className="muted" style={{ fontSize: 13 }}>
                  Viatura de interesse
                </span>
                <p>
                  <Link href={`/painel/viaturas/${vehicle.id}`} className="a-row-link" style={{ fontWeight: 600 }}>
                    {vehicle.make} {vehicle.model} {vehicle.version}
                  </Link>
                </p>
              </div>
              <Plate value={vehicle.plate} />
              {vehicle.priceEur && <span className="num">{eur.format(vehicle.priceEur)}</span>}
            </section>
          )}
          <section className="a-card">
            <div className="a-card-head">
              <h2>Histórico</h2>
            </div>
            <div className="a-card-body a-timeline">
              {events.map((e) => (
                <div key={e.id} className={`a-event ${e.type}`}>
                  <div>
                    <p>{e.body}</p>
                    <small>
                      {e.userName} · {dateTime(e.createdAt)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="a-card a-card-pad">
          <LeadControls
            id={lead.id}
            status={lead.status}
            assignedTo={lead.assignedTo}
            users={users}
            customerId={lead.customerId}
            canEdit={can(user, "leads.edit")}
            canConvert={can(user, "customers.edit") && can(user, "leads.edit")}
          />
        </aside>
      </div>
    </div>
  );
}
