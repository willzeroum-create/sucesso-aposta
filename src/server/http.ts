import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "./auth/session";
import { UploadError } from "./storage";
import { AiError } from "./ai/provider";
import { UserError } from "./action";

/** Rotas do painel com efeitos: só aceitam pedidos da própria origem (defesa CSRF além do SameSite). */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new AuthError("Pedido recusado.", 403);
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {}
  if (!ok) throw new AuthError("Pedido recusado.", 403);
}

export function jsonError(e: unknown): NextResponse {
  if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  if (e instanceof UploadError || e instanceof UserError) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
  if (e instanceof AiError)
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status >= 400 && e.status < 600 ? e.status : 500 });
  console.error("[api]", e);
  return NextResponse.json({ ok: false, error: "Ocorreu um erro inesperado. Tente novamente." }, { status: 500 });
}

export async function readFiles(form: FormData, field = "files", max = 10): Promise<{ name: string; buffer: Buffer }[]> {
  const entries = form.getAll(field).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!entries.length) throw new UserError("Escolha pelo menos um ficheiro.");
  if (entries.length > max) throw new UserError(`No máximo ${max} ficheiros de cada vez.`);
  return Promise.all(entries.map(async (f) => ({ name: f.name || "ficheiro", buffer: Buffer.from(await f.arrayBuffer()) })));
}
