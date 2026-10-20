import { DriveShowroom } from "@/components/drive-showroom";
import { getCatalogData } from "@/lib/catalog";
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

export default async function Home() {
  const catalog = await loadCatalog();
  return <DriveShowroom catalog={catalog} />;
}
