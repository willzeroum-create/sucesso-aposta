import { NextResponse, type NextRequest } from "next/server";
import { acceptLead, coerceLeadInput, hashIp, LeadValidationError } from "@/server/leads";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string, fields?: Record<string, string | undefined>) {
  return NextResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status, headers: { "Cache-Control": "no-store" } });
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // navegadores antigos/ferramentas; o limite por IP continua a aplicar-se
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

/** POST /api/leads — contrato em docs/BACKEND_HANDOFF.md. 201 só depois de gravar. */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return error(403, "FORBIDDEN", "Pedido recusado.");
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return error(415, "UNSUPPORTED_MEDIA_TYPE", "Envie o pedido em JSON.");
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 16_384) return error(413, "PAYLOAD_TOO_LARGE", "O pedido é demasiado grande.");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  try {
    // Sem IP (servidor sem proxy à frente) todos partilham a mesma chave: limite mais largo.
    const limit = ip ? await rateLimit(`lead:${hashIp(ip)}`, 5, 10 * 60 * 1000) : await rateLimit("lead:sem-ip", 60, 10 * 60 * 1000);
    if (!limit.ok) {
      const res = error(429, "RATE_LIMITED", "Recebemos vários pedidos seguidos. Tente novamente dentro de alguns minutos.");
      res.headers.set("Retry-After", String(limit.retryAfter));
      return res;
    }
  } catch (e) {
    console.error("[leads] rate limit", e);
    return error(503, "SERVICE_UNAVAILABLE", "O serviço está temporariamente indisponível. Os dados continuam no formulário.");
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 16_384) return error(413, "PAYLOAD_TOO_LARGE", "O pedido é demasiado grande.");
    body = JSON.parse(text);
  } catch {
    return error(400, "INVALID_JSON", "Não foi possível ler o pedido.");
  }

  const referer = req.headers.get("referer");
  const utm: Record<string, string> = {};
  if (referer) {
    try {
      const u = new URL(referer);
      for (const k of ["utm_source", "utm_medium", "utm_campaign"]) {
        const v = u.searchParams.get(k);
        if (v) utm[k] = v;
      }
    } catch {}
  }

  try {
    const { leadId } = await acceptLead(coerceLeadInput(body), { ip, utm });
    return NextResponse.json({ status: "accepted", leadId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof LeadValidationError) return error(422, "VALIDATION_ERROR", e.message, e.fields);
    console.error("[leads] persist", e instanceof Error ? e.message : e);
    return error(503, "SERVICE_UNAVAILABLE", "Não foi possível guardar o pedido. Os dados continuam no formulário; tente novamente.");
  }
}
