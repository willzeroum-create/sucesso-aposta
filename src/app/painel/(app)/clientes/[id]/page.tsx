import Link from "next/link";
import { CONTRACT_STATUS_LABEL, money } from "@/lib/cobrancas";
import { lisbonDateTime, RENTAL_STATE_LABEL } from "@/lib/rentals";
import { SECTIONS } from "@/lib/sections";
import { chargeContractsFor } from "@/server/cobrancas";
import { customerRentals as vehicleRentalsOfCustomer } from "@/server/rentals";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/db";
import { CustomerForm } from "@/components/painel/customer-form";
import { DeleteCustomer } from "@/components/painel/delete-customer";
import { DocumentsPanel } from "@/components/painel/documents-panel";
import { FormGenerator } from "@/components/painel/form-generator";
import { Plate, StatusPill } from "@/components/painel/ui";
import { CUSTOMER_DOCUMENT_KINDS } from "@/lib/document-kinds";
import { dateTime, LEAD_STATUS } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";
import { documentsFor, entityHistory, formHistory, templateInfos, vehicleOptions } from "@/server/queries";

const TABS = [
  { key: "ficha", label: "Ficha" },
  { key: "documentos", label: "Documentos" },
  { key: "termos", label: "Termos" },
  { key: "historico", label: "Histórico" },
] as const;

export async function generateMetadata(props: PageProps<"/painel/clientes/[id]">) {
  const { id } = await props.params;
  const [c] = await db.select({ n: schema.customers.fullName }).from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
  return { title: c?.n ?? "Cliente" };
}

export default async function CustomerPage(props: PageProps<"/painel/clientes/[id]">) {
  const user = await requirePagePermission("customers.view");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, id)).limit(1);
  if (!c) notFound();
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "ficha";
  const vehicles = await db.select().from(schema.vehicles).where(eq(schema.vehicles.buyerCustomerId, id));
  const leads = can(user, "leads.view") ? await db.select().from(schema.leads).where(eq(schema.leads.customerId, id)).orderBy(desc(schema.leads.createdAt)) : [];
  // Vendas a prestações e alugueres deste cliente, para se ver tudo na ficha.
  const charges = can(user, "billing.manage") ? await chargeContractsFor({ customerId: id }) : [];
  const rentals = can(user, "vehicles.view") ? (await vehicleRentalsOfCustomer(id)) : [];
  const initial = Object.fromEntries(
    Object.entries(c)
      .filter(([k]) => !["id", "createdAt", "updatedAt", "createdBy"].includes(k))
      .map(([k, v]) => [k, v == null ? "" : String(v)]),
  );

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <Link href="/painel/clientes" className="a-crumb">
            <ArrowLeft size={14} /> Clientes
          </Link>
          <h1>{c.fullName}</h1>
          <p>{[c.nif ? `NIF ${c.nif}` : null, c.phone, c.email, c.city].filter(Boolean).join(" · ") || "Ficha sem contactos"}</p>
        </div>
      </div>

      {(vehicles.length > 0 || leads.length > 0 || charges.length > 0 || rentals.length > 0) && (
        <div className="a-grid-2">
          {charges.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <h2>Vendas a prestações</h2>
              </div>
              <table className="a-table">
                <tbody>
                  {charges.map((ch) => (
                    <tr key={ch.id}>
                      <td>
                        <Link href={`/painel/cobrancas/${ch.id}`} className="a-row-link">
                          {ch.vehicle.label || "Viatura"}
                        </Link>
                        <div className="muted" style={{ fontSize: 13 }}>
                          Falta {money(ch.balance)} de {money(ch.toCollect)}
                        </div>
                        {ch.secondCustomer && (
                          <div className="muted" style={{ fontSize: 13 }}>
                            {ch.secondCustomer.id === id ? `2.º titular / fiador (cliente: ${ch.customer.name})` : `2.º titular / fiador: ${ch.secondCustomer.name}`}
                          </div>
                        )}
                      </td>
                      <td className="right">
                        <span className={`a-pill ${ch.status === "atrasado" ? "danger" : ch.status === "quitado" ? "neutral" : "available"}`}>{CONTRACT_STATUS_LABEL[ch.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {rentals.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <h2>Alugueres</h2>
              </div>
              <table className="a-table">
                <tbody>
                  {rentals.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`${SECTIONS[r.section].base}/${r.vehicleId}?tab=aluguer`} className="a-row-link">
                          {r.vehicle}
                        </Link>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {lisbonDateTime(new Date(r.startAt))} → {lisbonDateTime(new Date(r.endAt))}
                        </div>
                      </td>
                      <td className="right">
                        <span className="a-pill plain">{RENTAL_STATE_LABEL[r.state]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {vehicles.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <h2>Viaturas</h2>
              </div>
              <table className="a-table">
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link href={`${SECTIONS[v.section].base}/${v.id}`} className="a-row-link">
                          {v.make} {v.model}
                        </Link>
                      </td>
                      <td>
                        <Plate value={v.plate} />
                      </td>
                      <td className="right">
                        <StatusPill status={v.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {leads.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <h2>Pedidos de contacto</h2>
              </div>
              <table className="a-table">
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <Link href={`/painel/crm/${l.id}`} className="a-row-link">
                          {l.message.slice(0, 70)}
                          {l.message.length > 70 ? "…" : ""}
                        </Link>
                      </td>
                      <td className="right">
                        <span className="a-pill neutral plain">{LEAD_STATUS[l.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      <nav className="a-tabs" aria-label="Secções do cliente">
        {TABS.filter((t) => (t.key === "documentos" ? can(user, "documents.view") : t.key === "termos" ? can(user, "forms.generate") : true)).map((t) => (
          <Link key={t.key} href={`/painel/clientes/${id}?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} scroll={false}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "ficha" &&
        (can(user, "customers.edit") ? (
          <CustomerForm id={c.id} initial={initial} />
        ) : (
          <section className="a-card a-card-pad">
            <dl className="a-dl">
              {[
                ["Nome", c.fullName], ["NIF", c.nif], ["Documento", [c.idDocumentType, c.idDocumentNumber].filter(Boolean).join(" ")], ["Telefone", c.phone],
                ["E-mail", c.email], ["Morada", [c.address, c.postalCode, c.city].filter(Boolean).join(", ")],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

      {tab === "documentos" && can(user, "documents.view") && (
        <DocumentsPanel owner={{ type: "customer", id: c.id }} docs={await documentsFor("customer", c.id)} kinds={CUSTOMER_DOCUMENT_KINDS} canUpload={can(user, "documents.upload") && can(user, "customers.edit")} />
      )}

      {tab === "termos" && can(user, "forms.generate") && (
        <FormGenerator
          templates={await templateInfos()}
          customers={[]}
          vehicles={await vehicleOptions()}
          fixedCustomerId={c.id}
          history={await formHistory({ customerId: c.id })}
        />
      )}

      {tab === "historico" && (
        <section className="a-card a-card-body">
          <div className="a-timeline">
            {(await entityHistory("customer", c.id)).map((e) => (
              <div className="a-event" key={e.id}>
                <div>
                  <p>
                    <strong style={{ fontWeight: 600 }}>{e.userName}</strong> — {e.summary}
                  </p>
                  <small>{dateTime(e.createdAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "ficha" && can(user, "customers.edit") && <DeleteCustomer id={c.id} name={c.fullName} />}
    </div>
  );
}
