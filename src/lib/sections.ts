/** Secções do painel onde vive cada viatura. Só as do "site" podem aparecer no site público. */
export const SECTIONS = {
  site: { label: "Viaturas do site", short: "Site", base: "/painel/viaturas", crumb: "Viaturas" },
  estoque: { label: "Estoque · venda", short: "Venda", base: "/painel/estoque", crumb: "Estoque" },
  // Os carros de aluguer também vivem no Estoque (com a etiqueta "Aluguer"); a página Aluguer trata dos alugueres.
  aluguer: { label: "Estoque · aluguer", short: "Aluguer", base: "/painel/estoque", crumb: "Estoque" },
} as const;

export type SectionKey = keyof typeof SECTIONS;

export const isSection = (v: unknown): v is SectionKey => typeof v === "string" && v in SECTIONS;
