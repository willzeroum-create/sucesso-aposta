import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { HeroSlide, PublicCatalogPayload, Vehicle } from "@/lib/contracts";
import { getSiteConfig } from "./settings";
import { publicUrl } from "./storage";

/** Viaturas vendidas continuam visíveis ("Vendido") durante este período. */
const SOLD_VISIBLE_DAYS = 30;

type VehicleRow = typeof schema.vehicles.$inferSelect;

/** Campos obrigatórios para uma viatura poder aparecer no site (contrato Vehicle). */
export function publicationGaps(v: Pick<VehicleRow, "year" | "mileageKm" | "fuel" | "transmission" | "powerHp" | "priceEur" | "make" | "model" | "version">, hasCover: boolean): string[] {
  const gaps: string[] = [];
  if (!v.make?.trim()) gaps.push("marca");
  if (!v.model?.trim()) gaps.push("modelo");
  if (!v.version?.trim()) gaps.push("versão");
  if (!v.year) gaps.push("ano");
  if (v.mileageKm === null || v.mileageKm === undefined) gaps.push("quilómetros");
  if (!v.fuel) gaps.push("combustível");
  if (!v.transmission) gaps.push("caixa");
  if (!v.powerHp) gaps.push("potência");
  if (!v.priceEur) gaps.push("preço");
  if (!hasCover) gaps.push("fotografia de capa");
  return gaps;
}

/**
 * Catálogo público a partir da base de dados, no formato exato de PublicCatalogPayload.
 * Só inclui viaturas publicadas, completas e fora de preparação; nunca dados internos.
 */
export async function buildPublicCatalog(): Promise<PublicCatalogPayload> {
  const site = await getSiteConfig();
  const rows = await db
    .select()
    .from(schema.vehicles)
    .where(and(eq(schema.vehicles.published, true), inArray(schema.vehicles.status, ["available", "reserved", "sold"])))
    .orderBy(asc(schema.vehicles.status), asc(schema.vehicles.createdAt));

  const ids = rows.map((r) => r.id);
  const photos = ids.length
    ? await db
        .select({ id: schema.vehiclePhotos.id, vehicleId: schema.vehiclePhotos.vehicleId, alt: schema.vehiclePhotos.alt, position: schema.vehiclePhotos.position, key: schema.files.storageKey })
        .from(schema.vehiclePhotos)
        .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
        .where(inArray(schema.vehiclePhotos.vehicleId, ids))
        .orderBy(asc(schema.vehiclePhotos.position))
    : [];

  const soldCutoff = Date.now() - SOLD_VISIBLE_DAYS * 86_400_000;
  const vehicles: Vehicle[] = [];
  for (const v of rows) {
    if (v.status === "sold" && (!v.soldAt || v.soldAt.getTime() < soldCutoff)) continue;
    const own = photos.filter((p) => p.vehicleId === v.id);
    const cover = own.find((p) => p.id === v.coverPhotoId) ?? own[0];
    if (publicationGaps(v, Boolean(cover)).length) continue;
    vehicles.push({
      id: v.id,
      slug: v.slug,
      make: v.make,
      model: v.model,
      version: v.version,
      category: v.category,
      year: v.year!,
      mileageKm: v.mileageKm!,
      fuel: v.fuel!,
      transmission: v.transmission!,
      powerHp: v.powerHp!,
      priceEur: v.priceEur!,
      image: publicUrl(cover!.key),
      imageAlt: cover!.alt || `${v.make} ${v.model} ${v.version}`.trim(),
      ...(v.highlight ? { highlight: v.highlight } : {}),
      status: v.status as Vehicle["status"],
    });
  }

  const published = new Set(vehicles.map((v) => v.id));
  const heroRows = await db
    .select()
    .from(schema.heroSlides)
    .where(eq(schema.heroSlides.published, true))
    .orderBy(asc(schema.heroSlides.position));
  let heroSlides: HeroSlide[] = heroRows
    .filter((h) => published.has(h.vehicleId))
    .slice(0, 12)
    .map((h) => ({
      id: h.id,
      vehicleId: h.vehicleId,
      imageDesktop: h.imageDesktop,
      imageMobile: h.imageMobile,
      objectPositionDesktop: h.objectPositionDesktop,
      objectPositionMobile: h.objectPositionMobile,
      textTone: h.textTone,
      eyebrow: h.eyebrow,
      headline: h.headline,
      ...(h.headlineAccent ? { headlineAccent: h.headlineAccent } : {}),
      description: h.description,
    }));

  // Sem capa publicada: composição automática com a primeira viatura disponível,
  // para o site nunca ficar sem destaque. A capa editorial definitiva é feita no painel.
  if (!heroSlides.length) {
    const first = vehicles.find((v) => v.status === "available") ?? vehicles[0];
    if (first) {
      heroSlides = [
        {
          id: `auto-${first.id}`,
          vehicleId: first.id,
          imageDesktop: first.image,
          imageMobile: first.image,
          objectPositionDesktop: "center",
          objectPositionMobile: "center",
          textTone: "light",
          eyebrow: `${first.make} ${first.model}`,
          headline: first.highlight || `${first.make} ${first.model}`,
          description: site.tagline,
        },
      ];
    }
  }

  return { site, vehicles, heroSlides };
}
