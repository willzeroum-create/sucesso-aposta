"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addVehicleCost, deleteVehicleCost, setPurchasePrice } from "@/app/painel/_actions/costs";
import { COST_CATEGORIES, type CostCategory, type CostSummary } from "@/lib/vehicle-costs";
import { Field, Spinner, useAction } from "./ui";

type Cost = { id: string; date: string; category: string; description: string; amountEur: number };

const eur = (v: number | null | undefined) => (v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v));
const parseMoney = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

/** Ficha financeira da viatura: compra + custos = custo total; margem prevista e lucro real. */
export function CostsPanel({ vehicleId, summary, costs, canEditPurchase }: { vehicleId: string; summary: CostSummary; costs: Cost[]; canEditPurchase: boolean }) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, category: "transporte" as CostCategory, description: "", amount: "" });
  const [purchase, setPurchase] = useState(summary.purchase != null ? String(summary.purchase) : "");

  async function add() {
    const res = await run(() => addVehicleCost(vehicleId, { ...form, amount: parseMoney(form.amount) }));
    if (res.ok) {
      setForm((f) => ({ ...f, description: "", amount: "" }));
      router.refresh();
    }
  }

  const margin = summary.realProfit ?? summary.expectedMargin;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="a-stats is-money">
        <div className="a-stat">
          <span>Compra</span>
          <strong>{eur(summary.purchase)}</strong>
        </div>
        <div className="a-stat">
          <span>Custos</span>
          <strong>{eur(summary.costs)}</strong>
          <small>{costs.length} registo{costs.length === 1 ? "" : "s"}</small>
        </div>
        <div className="a-stat">
          <span>Custo total</span>
          <strong>{eur(summary.total)}</strong>
        </div>
        <div className="a-stat">
          <span>{summary.realProfit != null ? "Lucro (vendido)" : "Margem prevista"}</span>
          <strong className={margin == null ? "" : margin >= 0 ? "is-good" : "is-bad"}>{eur(margin)}</strong>
          <small>{summary.realProfit != null ? `Vendido por ${eur(summary.sold)}` : summary.asking != null ? `Anunciado a ${eur(summary.asking)}` : "Sem preço anunciado"}</small>
        </div>
      </div>

      {canEditPurchase && (
        <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <Field label="Preço de compra (€)" name="purchase" error={errors.amount}>
            <input id="f-purchase" inputMode="decimal" value={purchase} onChange={(e) => setPurchase(e.target.value)} />
          </Field>
          <button
            type="button"
            className="a-btn"
            disabled={pending}
            onClick={async () => (await run(() => setPurchasePrice(vehicleId, purchase.trim() ? parseMoney(purchase) : null))).ok && router.refresh()}
          >
            Guardar compra
          </button>
        </section>
      )}

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Registar custo</h2>
            <p>Transporte, legalização, reparações, inspeção, pneus… Só a equipa com acesso a margens vê isto.</p>
          </div>
        </div>
        <div className="a-card-body a-fields">
          <Field label="Tipo" name="cost-category">
            <select id="f-cost-category" className="a-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as CostCategory }))}>
              {Object.entries(COST_CATEGORIES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor (€) *" name="cost-amount" error={errors.amount}>
            <input id="f-cost-amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="ex.: 350" />
          </Field>
          <Field label="Data" name="cost-date" error={errors.date}>
            <input id="f-cost-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
          <Field label="Descrição" name="cost-description" wide>
            <input id="f-cost-description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="ex.: Camião Holanda → Lisboa" />
          </Field>
        </div>
        <div className="a-form-foot" style={{ margin: 0 }}>
          <button type="button" className="a-btn a-btn-primary" onClick={add} disabled={pending || !form.amount.trim()}>
            {pending ? <Spinner /> : <Plus size={16} />} Registar custo
          </button>
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Custos registados</h2>
          </div>
        </div>
        {costs.length ? (
          <div className="a-docs">
            {costs.map((c) => (
              <div key={c.id} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{COST_CATEGORIES[c.category as CostCategory] ?? c.category}</strong>
                  <small>
                    {c.date.split("-").reverse().join("/")}
                    {c.description ? ` · ${c.description}` : ""}
                  </small>
                </span>
                <strong className="num">{eur(c.amountEur)}</strong>
                <button type="button" className="a-icon-btn" aria-label="Apagar custo" disabled={pending} onClick={async () => (await run(() => deleteVehicleCost(c.id))).ok && router.refresh()}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="a-empty">
            <strong>Ainda sem custos.</strong>
            <span className="muted">Registe aqui tudo o que a viatura custou até à venda.</span>
          </div>
        )}
      </section>
    </div>
  );
}
