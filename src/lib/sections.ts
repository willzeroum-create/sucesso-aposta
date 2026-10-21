/** Secções do painel onde vive cada viatura. Só as do "site" podem aparecer no site público. */
export const SECTIONS = {
  site: { label: "Viaturas do site", short: "Site", base: "/painel/viaturas", crumb: "Viaturas" },
  estoque: { label: "Estoque", short: "Estoque", base: "/painel/estoque", crumb: "Estoque" },
  aluguer: { label: "Frota de aluguer", short: "Aluguer", base: "/painel/aluguer", crumb: "Aluguer" },
} as const;

export type SectionKey = keyof typeof SECTIONS;

export const isSection = (v: unknown): v is SectionKey => typeof v === "string" && v in SECTIONS;
