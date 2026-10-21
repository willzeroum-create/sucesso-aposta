import Link from "next/link";
import { Plus } from "lucide-react";
import { ChargeContractList, InstallmentActions, InstallmentPill } from "@/components/painel/charges";
import { datePt, money, type InstallmentView } from "@/lib/cobrancas";
import { requirePagePermission } from "@/server/auth/session";
import { chargesOverview } from "@/server/cobrancas";

export const metadata = { title: "Cobranças" };

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
            <div key={i.id} className="a-doc a-doc-pay">
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
    <div className="a-page">
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

      {/* Esquerda: todos os clientes (com pesquisa). Direita: quem deve. No telemóvel, quem deve aparece primeiro. */}
      <div className="a-split">
        <div className="a-split-col">
          <ChargeContractList
            items={[...active, ...done].map((c) => ({
              id: c.id,
              name: c.customer.name,
              phone: c.customer.phone,
              vehicle: c.vehicle.label,
              plate: c.vehicle.plate,
              balance: c.balance,
              toCollect: c.toCollect,
              nextDue: c.next?.dueDate ?? null,
              status: c.status,
            }))}
          />
        </div>
        <div className="a-split-col is-first-mobile">
          <InstallmentList title="Em atraso" items={o.late} empty="Ninguém em atraso." />
          <InstallmentList title="Vence hoje" items={o.dueToday} empty="Nada vence hoje." />
          <InstallmentList title="Próximos 7 dias" items={o.upcoming} empty="Nada nos próximos 7 dias." />
        </div>
      </div>
    </div>
  );
}
