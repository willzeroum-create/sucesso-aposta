import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { rentalDays, rentalState, type RentalState, type RentalStatus } from "@/lib/rentals";
import { publicUrl } from "./storage";

export type RentalView = {
  id: string;
  vehicleId: string;
  vehicle: string;
  plate: string;
  section: "site" | "estoque" | "aluguer";
  photo: string | null;
  customerId: string;
  customer: string;
  phone: string;
  startAt: string;
  endAt: string;
  returnedAt: string | null;
  kmOut: number | null;
  kmIn: number | null;
  totalEur: number | null;
  days: number;
  paymentMethod: string | null;
  notes: string | null;
  status: RentalStatus;
  state: RentalState;
  stateDays: number;
};

async function load(where?: ReturnType<typeof eq>) {
  const base = db
    .select({
      r: schema.rentals,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plate,
      section: schema.vehicles.section,
      cover: schema.vehicles.coverPhotoId,
      customer: schema.customers.fullName,
      phone: schema.customers.phone,
    })
    .from(schema.rentals)
    .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.rentals.vehicleId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.rentals.customerId));
  const rows = await (where ? base.where(where) : base).orderBy(desc(schema.rentals.startAt)).limit(500);
  const coverIds = [...new Set(rows.map((x) => x.cover).filter((c): c is string => !!c))];
  const covers = coverIds.length
    ? await db
        .select({ id: schema.vehiclePhotos.id, key: schema.files.storageKey })
        .from(schema.vehiclePhotos)
        .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
        .where(inArray(schema.vehiclePhotos.id, coverIds))
    : [];
  const now = new Date();
  return rows.map(({ r, ...x }): RentalView => {
    const st = rentalState(r, now);
    const cover = covers.find((c) => c.id === x.cover);
    return {
      id: r.id,
      vehicleId: r.vehicleId,
      vehicle: `${x.make} ${x.model}`.trim(),
      plate: x.plate ?? "",
      section: x.section,
      photo: cover ? publicUrl(cover.key) : null,
      customerId: r.customerId,
      customer: x.customer,
      phone: x.phone ?? "",
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      returnedAt: r.returnedAt?.toISOString() ?? null,
      kmOut: r.kmOut,
      kmIn: r.kmIn,
      totalEur: r.totalEur,
      days: rentalDays(r.startAt, r.endAt),
      paymentMethod: r.paymentMethod,
      notes: r.notes,
      status: r.status,
      state: st.state,
      stateDays: st.days,
    };
  });
}

export const vehicleRentals = (vehicleId: string) => load(eq(schema.rentals.vehicleId, vehicleId));
export const customerRentals = (customerId: string) => load(eq(schema.rentals.customerId, customerId));

export async function rentalsOverview() {
  const all = await load();
  const active = all.filter((r) => r.status === "active").sort((a, b) => a.endAt.localeCompare(b.endAt));
  const history = all.filter((r) => r.status !== "active");
  const month = new Date().toISOString().slice(0, 7);
  return {
    active,
    history,
    totals: {
      out: active.filter((r) => r.state !== "agendado").length,
      late: active.filter((r) => r.state === "atrasado").length,
      today: active.filter((r) => r.state === "termina_hoje").length,
      monthEur: Math.round(all.filter((r) => r.status !== "cancelled" && r.startAt.slice(0, 7) === month).reduce((s, r) => s + (r.totalEur ?? 0), 0) * 100) / 100,
    },
  };
}

/** Carros da frota de aluguer, com o aluguer em curso (se houver). */
export async function rentalFleet() {
  const cars = await db
    .select()
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.section, "aluguer"), ne(schema.vehicles.status, "sold")))
    .orderBy(asc(schema.vehicles.make), asc(schema.vehicles.model));
  return cars;
}

/** Viaturas com aluguer ativo (para marcar "Alugado" noutras listas). */
export async function activeRentalVehicleIds(): Promise<Set<string>> {
  const rows = await db.select({ v: schema.rentals.vehicleId }).from(schema.rentals).where(eq(schema.rentals.status, "active"));
  return new Set(rows.map((r) => r.v));
}
