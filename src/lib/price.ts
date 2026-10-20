import type { Vehicle } from "./contracts";

/** Texto do preço no site: `priceEur` null quer dizer "sob consulta". */
export function priceText(vehicle: Pick<Vehicle, "priceEur">, format: Intl.NumberFormat): string {
  return vehicle.priceEur === null ? "Preço sob consulta" : format.format(vehicle.priceEur);
}

/** Filtro "Até X €": as viaturas sob consulta aparecem sempre. */
export function withinBudget(vehicle: Pick<Vehicle, "priceEur">, budget: string): boolean {
  return budget === "all" || vehicle.priceEur === null || vehicle.priceEur <= Number(budget);
}

/** Ordenação por preço (1 crescente, -1 decrescente); as sob consulta ficam no fim. */
export function byPrice(direction: 1 | -1) {
  return (a: Pick<Vehicle, "priceEur">, b: Pick<Vehicle, "priceEur">): number => {
    if (a.priceEur === b.priceEur) return 0;
    if (a.priceEur === null) return 1;
    if (b.priceEur === null) return -1;
    return (a.priceEur - b.priceEur) * direction;
  };
}
