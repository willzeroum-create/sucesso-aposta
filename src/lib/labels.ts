/** Rótulos pt-PT partilhados pelo painel. */
export const VEHICLE_STATUS = {
  preparation: { label: "Em preparação", hint: "Fora do site" },
  available: { label: "Disponível", hint: "À venda" },
  reserved: { label: "Reservado", hint: "Sinal ou acordo" },
  sold: { label: "Vendido", hint: "Negócio fechado" },
} as const;
export type VehicleStatusKey = keyof typeof VEHICLE_STATUS;

export const CATEGORY = { coupe: "Desportivo / coupé", saloon: "Berlina / hatchback", suv: "SUV", estate: "Carrinha" } as const;
export const FUEL = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" } as const;
export const TRANSMISSION = { automatic: "Automática", manual: "Manual" } as const;

export const LEAD_STATUS = {
  new: "Novo",
  contacted: "Contactado",
  qualified: "Qualificado",
  negotiation: "Em negociação",
  won: "Ganho",
  lost: "Perdido",
} as const;
export const LEAD_INTENT = {
  vehicle: "Interesse numa viatura",
  sourcing: "Procura personalizada",
  visit: "Pedido de visita",
  general: "Outro assunto",
} as const;

export const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const eur2 = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
export const int = new Intl.NumberFormat("pt-PT");

export function dateTime(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Lisbon" });
}
export function dateOnly(d: Date | string | number | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return date.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" });
}
export function relative(d: Date | string | number): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} dia${days === 1 ? "" : "s"}`;
  return dateOnly(d);
}
export function daysSince(d: Date | string | number): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
}
