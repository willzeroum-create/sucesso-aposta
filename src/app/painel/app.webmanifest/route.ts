import { getSiteConfig } from "@/server/settings";

export const dynamic = "force-dynamic";

/** Permite "Adicionar ao ecrã principal": o painel abre como uma app no telemóvel. */
export async function GET() {
  const site = await getSiteConfig().catch(() => null);
  const name = site?.name ? `${site.name} · Painel` : "Painel do stand";
  return Response.json(
    {
      name,
      short_name: "Painel",
      start_url: "/painel",
      scope: "/painel",
      display: "standalone",
      orientation: "portrait",
      background_color: "#121513",
      theme_color: "#641e2c",
      lang: "pt-PT",
      icons: [
        { src: "/painel-icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/painel-icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/painel-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
