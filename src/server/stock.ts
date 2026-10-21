import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { activeRentalVehicleIds } from "./rentals";
import { publicUrl } from "./storage";

export type StockItem = {
  id: string;
  /** Função do carro no estoque: venda ou aluguer. */
  section: "estoque" | "aluguer";
  make: string;
  model: string;
  version: string;
  plate: string;
  vin: string;
  year: number | null;
  km: number | null;
  fuel: string | null;
  color: string | null;
  status: "preparation" | "available" | "reserved" | "sold";
  photo: string | null;
  photos: number;
  since: string;
  supplier: string | null;
  purchase: number | null;
  costs: number;
  costCount: number;
  price: number | null;
  sold: number | null;
  rented: boolean;
};

/** Viaturas do estoque interno, de venda e de aluguer (fora do site), com fotografia de capa, custos e se estão alugadas. */
export async function stockList(): Promise<StockItem[]> {
  const rows = await db.select().from(schema.vehicles).where(inArray(schema.vehicles.section, ["estoque", "aluguer"])).orderBy(asc(schema.vehicles.createdAt));
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const costs = await db
    .select({ v: schema.vehicleCosts.vehicleId, total: sql<number>`coalesce(sum(${schema.vehicleCosts.amountEur}), 0)`, n: sql<number>`count(*)::int` })
    .from(schema.vehicleCosts)
    .where(inArray(schema.vehicleCosts.vehicleId, ids))
    .groupBy(schema.vehicleCosts.vehicleId);
  const photos = await db
    .select({ id: schema.vehiclePhotos.id, v: schema.vehiclePhotos.vehicleId, key: schema.files.storageKey })
    .from(schema.vehiclePhotos)
    .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
    .where(inArray(schema.vehiclePhotos.vehicleId, ids))
    .orderBy(asc(schema.vehiclePhotos.position));
  const rented = await activeRentalVehicleIds();
  return rows.map((v) => {
    const own = photos.filter((p) => p.v === v.id);
    const cover = own.find((p) => p.id === v.coverPhotoId) ?? own[0];
    const c = costs.find((x) => x.v === v.id);
    return {
      id: v.id,
      section: v.section === "aluguer" ? "aluguer" : "estoque",
      make: v.make,
      model: v.model,
      version: v.version,
      plate: v.plate ?? "",
      vin: v.vin ?? "",
      year: v.year,
      km: v.mileageKm,
      fuel: v.fuel,
      color: v.color,
      status: v.status,
      photo: cover ? publicUrl(cover.key) : null,
      photos: own.length,
      since: (v.purchaseDate ? new Date(`${v.purchaseDate}T12:00:00Z`) : v.createdAt).toISOString(),
      supplier: v.supplier,
      purchase: v.purchasePriceEur,
      costs: Math.round(Number(c?.total ?? 0) * 100) / 100,
      costCount: Number(c?.n ?? 0),
      price: v.priceEur,
      sold: v.soldPriceEur,
      rented: rented.has(v.id),
    };
  });
}
