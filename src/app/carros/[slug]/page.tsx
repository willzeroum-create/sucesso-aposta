import { Showroom } from "@/components/showroom";
import { getCatalogData } from "@/lib/catalog";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
const loadCatalog = cache(getCatalogData);

const fuels: Record<string, string> = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" };
const euro = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const km = new Intl.NumberFormat("pt-PT");

/** Só existe enquanto a viatura estiver no site: retirada, apagada ou vendida há mais de 30 dias → 404. */
async function findVehicle(slug: string) {
  const catalog = await loadCatalog();
  const vehicle = catalog.vehicles.find((v) => v.slug === decodeURIComponent(slug));
  return { catalog, vehicle };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { catalog, vehicle: v } = await findVehicle(slug);
  if (!v) return { title: `Viatura indisponível — ${catalog.site.name}` };

  const name = `${v.make} ${v.model} ${v.version}`.replace(/\s+/g, " ").trim();
  const price = v.priceEur === null ? "Preço sob consulta" : euro.format(v.priceEur);
  const status = v.status === "sold" ? "Vendido" : v.status === "reserved" ? "Reservado" : null;
  const title = `${name} ${v.year} — ${status ?? price} | ${catalog.site.name}`;
  const description = [v.year, v.mileageKm !== null ? `${km.format(v.mileageKm)} km` : "Por encomenda", fuels[v.fuel], v.transmission === "automatic" ? "Automática" : "Manual", v.powerHp ? `${v.powerHp} cv` : null, price]
    .filter(Boolean)
    .join(" · ");

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const url = `${origin}/carros/${encodeURIComponent(v.slug)}`;
  const image = `${url}/partilha.jpg`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "pt_PT", siteName: catalog.site.name, url, title: `${name} ${v.year} — ${status ?? price}`, description, images: [{ url: image, width: 1200, height: 630, type: "image/jpeg", alt: v.imageAlt }] },
    twitter: { card: "summary_large_image", title: `${name} ${v.year}`, description, images: [image] },
  };
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { catalog, vehicle } = await findVehicle(slug);
  if (!vehicle) notFound();
  return <Showroom catalog={catalog} initialSlug={vehicle.slug} />;
}
