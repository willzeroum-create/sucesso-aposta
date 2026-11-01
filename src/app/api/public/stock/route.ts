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

const FUEL: Record<string, string> = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" };
const GEARBOX: Record<string, string> = { automatic: "Automática", manual: "Manual" };
const CATEGORY: Record<string, string> = { coupe: "Coupé", saloon: "Ligeiro", suv: "SUV", estate: "Carrinha" };
const STATUS: Record<string, string> = { available: "Disponível", reserved: "Reservado", sold: "Vendido" };

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * GET /api/public/stock — versão compacta do catálogo para agentes de atendimento (WhatsApp/blü).
 * Sem galerias nem listas de equipamento. Filtros opcionais: ?q=texto&combustivel=eletrico&disponivel=1
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Token inválido." }, { status: 401 });
  try {
    const { site, vehicles } = await buildPublicCatalog();
    const origin = req.nextUrl.origin;
    const sp = req.nextUrl.searchParams;
    const q = norm(sp.get("q") ?? sp.get("busca") ?? "").trim();
    const fuel = norm(sp.get("combustivel") ?? sp.get("fuel") ?? "").trim();
    const onlyAvailable = ["1", "true", "sim"].includes((sp.get("disponivel") ?? "").toLowerCase());

    const viaturas = vehicles
      .filter((v) => (onlyAvailable ? v.status === "available" : true))
      .map((v) => ({
        nome: `${v.make} ${v.model} ${v.version}`.replace(/\s+/g, " ").trim(),
        marca: v.make,
        modelo: v.model,
        versao: v.version,
        ano: v.year,
        km: v.onOrder ? "Por encomenda" : v.mileageKm,
        combustivel: FUEL[v.fuel] ?? v.fuel,
        caixa: GEARBOX[v.transmission] ?? v.transmission,
        link: `${origin}/?viatura=${encodeURIComponent(v.slug)}`,
        potenciaCv: v.powerHp,
        tipo: CATEGORY[v.category] ?? v.category,
        preco: v.priceEur ? `${v.priceEur.toLocaleString("pt-PT")} €` : "Sob consulta",
        estado: STATUS[v.status] ?? v.status,
        foto: v.image.startsWith("http") ? v.image : `${origin}${v.image}`,
      }))
      .filter((v) => {
        if (fuel && !norm(v.combustivel).startsWith(fuel.slice(0, 4))) return false;
        if (!q) return true;
        const hay = norm(`${v.nome} ${v.combustivel} ${v.caixa} ${v.tipo} ${v.ano}`);
        return q.split(/\s+/).every((w) => hay.includes(w));
      });

    return NextResponse.json(
      { stand: site.name, site: origin, total: viaturas.length, viaturas },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch (e) {
    console.error("[stock api]", e);
    return NextResponse.json({ error: "Stock indisponível." }, { status: 503 });
  }
}
