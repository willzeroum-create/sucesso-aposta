"use client";

import { useState } from "react";
import Link from "next/link";
import { Car, Search } from "lucide-react";
import { FUEL, VEHICLE_STATUS } from "@/lib/labels";
import { STAGE_PILL, STAGE_SHORT } from "@/lib/legalizacao";
import { SECTIONS } from "@/lib/sections";
import type { StockItem } from "@/server/stock";
import { Plate } from "./ui";

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("pt-PT");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const days = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));

const FILTERS = [
  { key: "stock", label: "Todos" },
  { key: "site", label: "Venda" },
  { key: "aluguer", label: "Aluguer" },
  { key: "estoque", label: "Só estoque" },
  { key: "legal", label: "Em legalização" },
  { key: "sold", label: "Vendidos" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const inFilter = (v: StockItem, k: FilterKey) =>
  k === "sold"
    ? v.status === "sold"
    : v.status !== "sold" && (k === "stock" || (k === "legal" ? v.legalization !== null && v.legalization !== "concluido" : v.section === k));

/** Lista do estoque com pesquisa por marca, modelo, matrícula ou VIN, e totais de custo por carro. */
export function StockList({ items, base, canCosts }: { items: StockItem[]; base: string; canCosts: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("stock");
  const q = fold(query.trim());
  const qPlate = query.replace(/[\s-]/g, "").toUpperCase();
  const byFilter = items.filter((v) => inFilter(v, filter));
  const shown = q
    ? byFilter.filter((v) => fold(`${v.make} ${v.model} ${v.version} ${v.color ?? ""}`).includes(q) || (qPlate.length >= 2 && `${v.plate.replace(/-/g, "")} ${v.vin}`.toUpperCase().includes(qPlate)))
    : byFilter;
  const count = (k: FilterKey) => items.filter((v) => inFilter(v, k)).length;

  return (
    <section className="a-card">
      <div className="a-card-body" style={{ display: "grid", gap: 12 }}>
        <div className="a-tabs" role="tablist" style={{ border: 0, margin: 0 }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label} <span className="muted">{count(f.key)}</span>
            </button>
          ))}
        </div>
        <div className="a-search" style={{ maxWidth: "none" }} role="search">
          <Search size={16} aria-hidden="true" />
          <input className="a-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por marca, modelo, matrícula ou VIN" aria-label="Procurar no estoque" />
        </div>
      </div>
      {shown.length ? (
        <div className="a-stock">
          {shown.map((v) => {
            const total = (v.purchase ?? 0) + v.costs;
            return (
              <Link key={v.id} href={`${base}/${v.id}`} className="a-stock-item">
                <span className="a-stock-photo">
                  {v.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.photo} alt="" loading="lazy" />
                  ) : (
                    <Car size={24} />
                  )}
                </span>
                <span className="a-stock-main">
                  <span className="a-stock-title">
                    <strong>
                      {v.make} {v.model}
                    </strong>
                    {v.plate ? <Plate value={v.plate} /> : <span className="a-pill neutral">Sem matrícula</span>}
                    <span className="a-role">{SECTIONS[v.section].short}</span>
                  </span>
                  <small className="muted">
                    {[v.version, v.year, v.km != null ? `${int.format(v.km)} km` : null, v.fuel ? FUEL[v.fuel as keyof typeof FUEL] : null, v.color].filter(Boolean).join(" · ") || "Dados por completar"}
                  </small>
                  <span className="a-stock-tags">
                    <span className={`a-pill ${v.status}`}>{VEHICLE_STATUS[v.status].label}</span>
                    {v.rented && <span className="a-pill reserved">Alugado</span>}
                    {v.section === "site" && v.status !== "sold" && <span className={`a-pill ${v.published ? "plain" : "neutral"}`}>{v.published ? "No site" : "Fora do site"}</span>}
                    {v.legalization && v.legalization !== "concluido" && <span className={`a-pill ${STAGE_PILL[v.legalization]}`}>Legalização: {STAGE_SHORT[v.legalization]}</span>}
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {days(v.since)} dias em estoque · {v.photos} foto{v.photos === 1 ? "" : "s"}
                    </span>
                  </span>
                </span>
                {canCosts && (
                  <span className="a-stock-money">
                    <span>
                      <small>Compra</small>
                      <strong>{v.purchase != null ? eur.format(v.purchase) : "—"}</strong>
                    </span>
                    <span>
                      <small>Custos ({v.costCount})</small>
                      <strong>{eur.format(v.costs)}</strong>
                    </span>
                    <span>
                      <small>Total investido</small>
                      <strong>{v.purchase != null || v.costs ? eur.format(total) : "—"}</strong>
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="a-empty">
          <strong>{items.length ? (q ? `Nada encontrado com «${query.trim()}».` : "Nenhum carro neste filtro.") : "O estoque ainda está vazio."}</strong>
        </div>
      )}
    </section>
  );
}
