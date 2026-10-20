import Link from "next/link";
import { Plus } from "lucide-react";
import { InstallmentActions, InstallmentPill } from "@/components/painel/charges";
import { CONTRACT_STATUS_LABEL, datePt, money, type ContractStatus, type InstallmentView } from "@/lib/cobrancas";
import { requirePagePermission } from "@/server/auth/session";
import { chargesOverview } from "@/server/cobrancas";

export const metadata = { title: "Cobranças" };

const PILL: Record<ContractStatus, string> = { em_dia: "available", atrasado: "danger", quitado: "neutral", sem_plano: "reserved" };

function InstallmentList({ title, items, empty }: { title: string; items: InstallmentView[]; empty: string }) {
  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>{title}</h2>
        </div>
        {items.length > 0 && <span className="a-pill plain">{items.length}</span>}
      </div>
      {items.length ? (
        <div className="a-docs">
          {items.map((i) => (
            <div key={i.id} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <span style={{ minWidth: 0, display: "grid", gap: 4 }}>
                <Link href={`/painel/cobrancas/${i.contractId}`} style={{ color: "inherit" }}>
                  <strong>{i.customer.name}</strong>
                </Link>
                <small>
                  {i.vehicle}
                  {i.plate ? ` · ${i.plate}` : ""} — {i.number}.ª prestação, {datePt(i.dueDate)}
                </small>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <strong className="num">{money(i.open)}</strong>
                  <InstallmentPill status={i.status} daysLate={i.daysLate} />
                </span>
              </span>
              <InstallmentActions installment={i} customer={i.customer} vehicle={i.vehicle} />
            </div>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ padding: "12px 20px", margin: 0, fontSize: 14 }}>
          {empty}
        </p>
      )}
    </section>
  );
}

export default async function ChargesPage() {
  await requirePagePermission("billing.manage");
  const o = await chargesOverview();
  const active = o.contracts.filter((c) => c.status !== "quitado");
  const done = o.contracts.filter((c) => c.status === "quitado");

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Cobranças</h1>
          <p>Vendas a prestações: quem deve, quanto, quando vence e quem está atrasado. Cobrar pelo WhatsApp com um toque.</p>
        </div>
        <Link href="/painel/cobrancas/nova" className="a-btn a-btn-primary">
          <Plus size={16} /> Nova venda a prestações
        </Link>
      </div>

      <div className="a-stats is-money">
        <div className="a-stat">
          <span>A receber</span>
          <strong>{money(o.totals.toReceive)}</strong>
          <small>{o.totals.active} venda{o.totals.active === 1 ? "" : "s"} ativa{o.totals.active === 1 ? "" : "s"}</small>
        </div>
        <div className="a-stat">
          <span>Em atraso</span>
          <strong className={o.totals.late ? "is-bad" : ""}>{money(o.totals.late)}</strong>
        </div>
        <div className="a-stat">
          <span>Vence hoje</span>
          <strong>{money(o.totals.dueToday)}</strong>
        </div>
        <div className="a-stat">
          <span>Recebido este mês</span>
          <strong className="is-good">{money(o.totals.receivedMonth)}</strong>
        </div>
      </div>

      <InstallmentList title="Em atraso" items={o.late} empty="Ninguém em atraso." />
      <InstallmentList title="Vence hoje" items={o.dueToday} empty="Nada vence hoje." />
      <InstallmentList title="Próximos 7 dias" items={o.upcoming} empty="Nada nos próximos 7 dias." />

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Vendas a prestações</h2>
          </div>
        </div>
        {o.contracts.length ? (
          <div className="a-docs">
            {[...active, ...done].map((c) => (
              <Link key={c.id} href={`/painel/cobrancas/${c.id}`} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", color: "inherit", textDecoration: "none" }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{c.customer.name}</strong>
                  <small style={{ display: "block" }}>
                    {c.vehicle.label}
                    {c.vehicle.plate ? ` · ${c.vehicle.plate}` : ""}
                  </small>
                  <small style={{ display: "block" }}>
                    Falta {money(c.balance)} de {money(c.toCollect)}
                    {c.next ? ` · próxima ${datePt(c.next.dueDate)}` : ""}
                  </small>
                </span>
                <span className={`a-pill ${PILL[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="a-empty">
            <strong>Ainda não há vendas a prestações.</strong>
          </div>
        )}
      </section>
    </div>
  );
}
