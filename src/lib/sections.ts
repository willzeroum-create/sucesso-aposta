/**
 * Destino de cada carro. Todos os carros estão no Estoque (controlo de dados e custos); o destino diz para onde vão:
 *   site    → Venda: vai para o site (só estes podem aparecer no site público)
 *   aluguer → Aluguer: frota de aluguer
 *   estoque → Só estoque: fica na casa, não vai para o site
 */
export const SECTIONS = {
  site: { label: "Venda (site)", short: "Venda", base: "/painel/viaturas", crumb: "Viaturas do site" },
  aluguer: { label: "Aluguer", short: "Aluguer", base: "/painel/estoque", crumb: "Estoque" },
  estoque: { label: "Só estoque", short: "Só estoque", base: "/painel/estoque", crumb: "Estoque" },
} as const;

export type SectionKey = keyof typeof SECTIONS;

export const isSection = (v: unknown): v is SectionKey => typeof v === "string" && v in SECTIONS;

/** Os três caminhos de um carro, pela ordem em que se escolhem. */
export const DESTINATIONS: { key: SectionKey; label: string; hint: string }[] = [
  { key: "site", label: "Venda", hint: "Vai para o site" },
  { key: "aluguer", label: "Aluguer", hint: "Frota de aluguer" },
  { key: "estoque", label: "Só estoque", hint: "Não vai para o site" },
];
