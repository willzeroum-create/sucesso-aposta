import Link from "next/link";
import { Plus } from "lucide-react";
import { StockList } from "@/components/painel/stock-list";
import { eur } from "@/lib/labels";
import { can, requirePagePermission } from "@/server/auth/session";
import { stockList } from "@/server/stock";

export const metadata = { title: "Estoque" };

export default async function StockPage() {
  const user = await requirePagePermission("vehicles.view");
  const canCosts = can(user, "vehicles.costs");
  const items = await stockList();
  const inStock = items.filter((v) => v.status !== "sold");
  const invested = inStock.reduce((s, v) => s + (v.purchase ?? 0) + v.costs, 0);
  const costs = inStock.reduce((s, v) => s + v.costs, 0);
  const missingPurchase = inStock.filter((v) => v.purchase == null).length;

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Estoque</h1>
          <p>Os carros da casa que não estão no site, de venda e de aluguer: todos os dados de cada carro e tudo o que já se gastou com ele.</p>
        </div>
        {can(user, "vehicles.edit") && (
          <Link href="/painel/viaturas/nova?seccao=estoque" className="a-btn a-btn-primary">
            <Plus size={16} /> Dar entrada no estoque
          </Link>
        )}
      </div>

      <div className={`a-stats${canCosts ? " is-money" : ""}`}>
        <div className="a-stat">
          <span>Carros em estoque</span>
          <strong>{inStock.length}</strong>
          <small>
            {inStock.filter((v) => v.section === "estoque").length} venda · {inStock.filter((v) => v.section === "aluguer").length} aluguer · {inStock.filter((v) => v.rented).length} alugado(s) agora
          </small>
        </div>
        {canCosts && (
          <>
            <div className="a-stat">
              <span>Total investido</span>
              <strong>{eur.format(invested)}</strong>
              <small>Compra + custos</small>
            </div>
            <div className="a-stat">
              <span>Custos registados</span>
              <strong>{eur.format(costs)}</strong>
            </div>
            <div className="a-stat">
              <span>Sem preço de compra</span>
              <strong className={missingPurchase ? "is-bad" : ""}>{missingPurchase}</strong>
              <small>{missingPurchase ? "Complete na ficha (Custos)" : "Tudo preenchido"}</small>
            </div>
          </>
        )}
      </div>

      <StockList items={items} base="/painel/estoque" canCosts={canCosts} />
    </div>
  );
}
