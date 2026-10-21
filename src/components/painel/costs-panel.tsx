"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { addVehicleCost, deleteVehicleCost, setPurchasePrice } from "@/app/painel/_actions/costs";
import { COST_CATEGORIES, type CostCategory, type CostSummary } from "@/lib/vehicle-costs";
import { Plate, Spinner, useAction } from "./ui";

type Cost = { id: string; date: string; category: string; description: string; amountEur: number };
export type CostVehicleInfo = {
  title: string;
  plate: string | null;
  vin: string | null;
  year: number | null;
  km: number | null;
  fuel: string | null;
  color: string | null;
  supplier: string | null;
  purchaseDate: string | null;
};

const eur = (v: number | null | undefined) => (v == null ? "—" : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v));
const parseMoney = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
const int = new Intl.NumberFormat("pt-PT");

/**
 * Ficha de custo do carro: à esquerda os dados principais e a compra; à direita a lista curta de
 * custos adicionais (descrição + valor, quantos forem precisos) e por quanto o carro está a sair.
 */
export function CostsPanel({
  vehicleId,
  summary,
  costs,
  canEditPurchase,
  info,
}: {
  vehicleId: string;
  summary: CostSummary;
  costs: Cost[];
  canEditPurchase: boolean;
  info: CostVehicleInfo;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [item, setItem] = useState({ description: "", amount: "" });
  const [purchase, setPurchase] = useState(summary.purchase != null ? String(summary.purchase).replace(".", ",") : "");
  const purchaseChanged = purchase !== (summary.purchase != null ? String(summary.purchase).replace(".", ",") : "");

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!item.amount.trim()) return;
    const res = await run(() =>
      addVehicleCost(vehicleId, { date: new Date().toISOString().slice(0, 10), category: "outro", description: item.description, amount: parseMoney(item.amount) }),
    );
    if (res.ok) {
      setItem({ description: "", amount: "" });
      router.refresh();
    }
  }

  const margin = summary.realProfit ?? summary.expectedMargin;
  const facts: [string, string][] = [
    ["Matrícula", info.plate ?? ""],
    ["VIN", info.vin ?? ""],
    ["Ano", info.year ? String(info.year) : ""],
    ["Quilómetros", info.km != null ? `${int.format(info.km)} km` : ""],
    ["Combustível", info.fuel ?? ""],
    ["Cor", info.color ?? ""],
    ["Fornecedor", info.supplier ?? ""],
    ["Data de compra", info.purchaseDate ? info.purchaseDate.split("-").reverse().join("/") : ""],
  ];

  return (
    <div className="a-costs">
      <section className="a-card a-card-pad" style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{info.title}</h2>
          {info.plate && <Plate value={info.plate} />}
        </div>
        <dl className="a-costs-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || <span className="muted">—</span>}</dd>
            </div>
          ))}
        </dl>
        <div className="a-costs-buy">
          <label htmlFor="f-purchase">Preço de compra</label>
          {canEditPurchase ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input id="f-purchase" className="a-input" inputMode="decimal" value={purchase} onChange={(e) => setPurchase(e.target.value)} placeholder="€" aria-invalid={Boolean(errors.amount)} />
              {purchaseChanged && (
                <button
                  type="button"
                  className="a-btn a-btn-primary"
                  disabled={pending}
                  onClick={async () => (await run(() => setPurchasePrice(vehicleId, purchase.trim() ? parseMoney(purchase) : null))).ok && router.refresh()}
                >
                  Guardar
                </button>
              )}
            </div>
          ) : (
            <strong>{eur(summary.purchase)}</strong>
          )}
        </div>
        {(summary.asking != null || summary.sold != null) && (
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {summary.sold != null ? `Vendido por ${eur(summary.sold)}` : `Preço de venda ${eur(summary.asking)}`}
            {margin != null && (
              <>
                {" · "}
                <strong className={margin >= 0 ? "is-good" : "is-bad"}>
                  {summary.realProfit != null ? "lucro" : "margem"} {eur(margin)}
                </strong>
              </>
            )}
          </p>
        )}
      </section>

      <aside className="a-card a-costs-side" aria-label="Custos adicionais">
        <div className="a-costs-head">
          <h2>Custos adicionais</h2>
          <span className="muted">{costs.length}</span>
        </div>
        {costs.length ? (
          <ul className="a-costs-list">
            {costs.map((c) => (
              <li key={c.id}>
                <span title={c.date.split("-").reverse().join("/")}>{c.description || COST_CATEGORIES[c.category as CostCategory] || c.category}</span>
                <strong className="num">{eur(c.amountEur)}</strong>
                <button type="button" className="a-icon-btn" aria-label={`Apagar ${c.description || "custo"}`} disabled={pending} onClick={async () => (await run(() => deleteVehicleCost(c.id))).ok && router.refresh()}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted a-costs-empty">Ainda sem custos. Ex.: desamassar a porta, 200 €.</p>
        )}
        <form className="a-costs-add" onSubmit={add}>
          <input className="a-input" value={item.description} onChange={(e) => setItem((x) => ({ ...x, description: e.target.value }))} placeholder="Descrição (ex.: pintura)" aria-label="Descrição do custo" />
          <input className="a-input" inputMode="decimal" value={item.amount} onChange={(e) => setItem((x) => ({ ...x, amount: e.target.value }))} placeholder="€" aria-label="Valor do custo" aria-invalid={Boolean(errors.amount)} />
          <button type="submit" className="a-btn a-btn-primary" disabled={pending || !item.amount.trim()} aria-label="Adicionar custo">
            {pending ? <Spinner size={14} /> : <Plus size={16} />}
          </button>
        </form>
        <dl className="a-costs-total">
          <div>
            <dt>Compra</dt>
            <dd>{eur(summary.purchase)}</dd>
          </div>
          <div>
            <dt>Custos adicionais</dt>
            <dd>{eur(summary.costs)}</dd>
          </div>
          <div className="is-final">
            <dt>O carro está a sair por</dt>
            <dd>{eur(summary.total)}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
