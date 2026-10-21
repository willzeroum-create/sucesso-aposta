/** Alugueres: regras puras (sem base de dados), partilhadas entre servidor e navegador. */

export type RentalStatus = "active" | "closed" | "cancelled";
export type RentalState = "agendado" | "a_decorrer" | "termina_hoje" | "atrasado" | "devolvido" | "cancelado";

export const RENTAL_STATE_LABEL: Record<RentalState, string> = {
  agendado: "Agendado",
  a_decorrer: "A decorrer",
  termina_hoje: "Devolve hoje",
  atrasado: "Devolução em atraso",
  devolvido: "Devolvido",
  cancelado: "Cancelado",
};

const TZ = "Europe/Lisbon";

/** Dia (AAAA-MM-DD) em Lisboa de um instante. */
export function lisbonDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "AAAA-MM-DD" + "HH:MM" escritos em Lisboa → instante certo (trata a hora de verão). */
export function lisbonDate(date: string, time = "12:00"): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess.getTime() - (wall - guess.getTime()));
}

/** Data e hora em Lisboa, para mostrar (ex.: "21/10/2026 10:00"). */
export function lisbonDateTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Partes "AAAA-MM-DD" e "HH:MM" em Lisboa (para preencher formulários). */
export function lisbonParts(d: Date): { date: string; time: string } {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
  return { date: lisbonDay(d), time };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Estado de um aluguer agora, com dias que faltam ou de atraso. */
export function rentalState(r: { startAt: Date; endAt: Date; status: RentalStatus }, now = new Date()): { state: RentalState; days: number } {
  if (r.status === "cancelled") return { state: "cancelado", days: 0 };
  if (r.status === "closed") return { state: "devolvido", days: 0 };
  const today = lisbonDay(now);
  if (r.startAt.getTime() > now.getTime() && lisbonDay(r.startAt) > today) return { state: "agendado", days: dayDiff(today, lisbonDay(r.startAt)) };
  if (r.endAt.getTime() < now.getTime()) return { state: "atrasado", days: Math.max(1, dayDiff(lisbonDay(r.endAt), today)) };
  const left = dayDiff(today, lisbonDay(r.endAt));
  return left <= 0 ? { state: "termina_hoje", days: 0 } : { state: "a_decorrer", days: left };
}

/** Número de dias cobrados (mínimo 1). */
export function rentalDays(startAt: Date, endAt: Date): number {
  return Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / 86_400_000));
}
