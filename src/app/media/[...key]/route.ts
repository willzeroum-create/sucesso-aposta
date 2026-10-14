import { getObject } from "@/server/storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", avif: "image/avif" };

/** Fotografias públicas (viaturas e capas). Só a pasta public/ é servida aqui. */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key } = await ctx.params;
  const path = key.join("/");
  if (!/^[\w-]+\/[\w.-]+\.(webp|jpg|png|avif)$/.test(path)) return new Response("Not found", { status: 404 });
  const data = await getObject(`public/${path}`);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[path.split(".").pop()!] ?? "application/octet-stream",
      // As chaves são únicas e imutáveis: cache longa.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
