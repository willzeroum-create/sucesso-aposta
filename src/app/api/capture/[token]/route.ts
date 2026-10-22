import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { captureByToken } from "@/server/capture";
import { storeCaptured } from "@/server/capture";
import { jsonError, readFiles } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST multipart (files) a partir do telemóvel, sem login: só com o token do código QR (uso curto e limitado).
 * Uma fotografia por pedido (o telemóvel reduz antes de enviar).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/capture/[token]">) {
  try {
    const { token } = await ctx.params;
    const session = await captureByToken(token);
    if (!session) throw new UserError("Este código já expirou. Gere outro no computador.");
    const limit = await rateLimit(`capture:${session.id}`, 40, 60 * 60 * 1000);
    if (!limit.ok) throw new UserError("Demasiados envios. Gere outro código no computador.");
    const [file] = await readFiles(await req.formData(), "files", 1);
    const fileId = await storeCaptured(session, file);
    if ((session.ownerType === "vehicle" || session.ownerType === "photos") && session.ownerId) {
      revalidatePath(`/painel/viaturas/${session.ownerId}`);
      revalidatePath(`/painel/estoque/${session.ownerId}`);
    }
    if (session.ownerType === "customer") revalidatePath(`/painel/clientes/${session.ownerId}`);
    return NextResponse.json({ ok: true, fileId, count: session.fileIds.length });
  } catch (e) {
    return jsonError(e);
  }
}
