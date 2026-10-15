/** Tipos de custo de uma viatura (ficha financeira). */
export const COST_CATEGORIES = {
  transporte: "Transporte",
  legalizacao: "Legalização (ISV, IUC, IMT, Modelo 9)",
  inspecao: "Inspeção",
  mecanica: "Mecânica / reparação",
  chaparia: "Chapa e pintura",
  pneus: "Pneus",
  preparacao: "Limpeza e preparação",
  documentos: "Documentos e registo",
  comissao: "Comissão",
  publicidade: "Publicidade",
  outro: "Outro",
} as const;

export type CostCategory = keyof typeof COST_CATEGORIES;

export interface CostSummary {
  purchase: number | null;
  costs: number;
  total: number;
  asking: number | null;
  sold: number | null;
  /** Margem prevista (preço anunciado − custo total) ou lucro real (preço de venda − custo total). */
  expectedMargin: number | null;
  realProfit: number | null;
}

export function costSummary(v: { purchasePriceEur: number | null; priceEur: number | null; soldPriceEur: number | null }, costs: { amountEur: number }[]): CostSummary {
  const sum = Math.round(costs.reduce((s, c) => s + c.amountEur, 0) * 100) / 100;
  const total = Math.round(((v.purchasePriceEur ?? 0) + sum) * 100) / 100;
  return {
    purchase: v.purchasePriceEur,
    costs: sum,
    total,
    asking: v.priceEur,
    sold: v.soldPriceEur,
    expectedMargin: v.priceEur != null ? Math.round((v.priceEur - total) * 100) / 100 : null,
    realProfit: v.soldPriceEur != null ? Math.round((v.soldPriceEur - total) * 100) / 100 : null,
  };
}
