import { Showroom } from "@/components/showroom";
import { getCatalogData } from "@/lib/catalog";
import { permanentRedirect } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
const loadCatalog = cache(getCatalogData);

export async function generateMetadata(): Promise<Metadata> {
  const { site, source } = await loadCatalog();
  return {
    title: `${site.name} — ${site.tagline.replace(/\.$/, "")}`,
    description: `${site.tagline}${source === "demo" ? " Projeto em demonstração." : ""}`,
  };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ viatura?: string | string[] }> }) {
  // Links antigos /?viatura=<slug> passam para o endereço próprio do carro.
  const { viatura } = await searchParams;
  if (typeof viatura === "string" && viatura) permanentRedirect(`/carros/${encodeURIComponent(viatura)}`);
  const catalog = await loadCatalog();
  return <Showroom catalog={catalog} />;
}
