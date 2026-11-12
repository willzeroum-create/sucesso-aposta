import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCatalogData } from "@/lib/catalog";
import { getObject } from "@/server/storage";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 630;

/** Imagem da pré-visualização do link (WhatsApp, Facebook): capa do carro em JPG 1200×630 com a faixa da marca. */
export async function GET(_req: Request, ctx: RouteContext<"/carros/[slug]/partilha.jpg">) {
  const { slug } = await ctx.params;
  const { vehicles } = await getCatalogData();
  const v = vehicles.find((x) => x.slug === decodeURIComponent(slug));
  if (!v) return new Response("Not found", { status: 404 });

  let photo: Buffer | null = null;
  if (v.image.startsWith("/media/")) photo = await getObject(`public/${v.image.slice("/media/".length)}`);
  else if (v.image.startsWith("/")) photo = await readFile(join(process.cwd(), "public", v.image)).catch(() => null);
  else photo = await fetch(v.image).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? Buffer.from(b) : null)).catch(() => null);
  if (!photo) return new Response("Not found", { status: 404 });

  // Foto inteira (o carro nunca é cortado, mesmo em fotos verticais) sobre a mesma foto desfocada.
  const bar = 14;
  const h = H - bar;
  const backdrop = await sharp(photo).resize(W, h, { fit: "cover" }).blur(28).modulate({ brightness: 0.75 }).toBuffer();
  const front = await sharp(photo).resize(W, h, { fit: "inside" }).toBuffer();
  const fm = await sharp(front).metadata();
  const jpg = await sharp(backdrop)
    .composite([{ input: front, left: Math.round((W - fm.width!) / 2), top: Math.round((h - fm.height!) / 2) }])
    .extend({ bottom: bar, background: "#c4120f" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return new Response(new Uint8Array(jpg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
