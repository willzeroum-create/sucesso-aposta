import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { buildPublicCatalog } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.CATALOG_API_TOKEN;
  if (!token) return true;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** GET /api/public/catalog — PublicCatalogPayload para consumidores externos (ver BACKEND_HANDOFF). */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Token inválido." } }, { status: 401 });
  try {
    const payload = await buildPublicCatalog();
    return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } });
  } catch (e) {
    console.error("[catalog api]", e);
    return NextResponse.json({ error: { code: "SERVICE_UNAVAILABLE", message: "Catálogo indisponível." } }, { status: 503 });
  }
}
