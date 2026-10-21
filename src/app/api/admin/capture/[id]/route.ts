import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthError, getSessionUser } from "@/server/auth/session";
import { captureForUser } from "@/server/capture";
import { publicUrl } from "@/server/storage";
import { jsonError } from "@/server/http";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";

/** O computador pergunta de 2 em 2 segundos que fotografias já chegaram do telemóvel. */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/capture/[id]">) {
  try {
    const user = await getSessionUser();
    if (!user) throw new AuthError("Sessão expirada. Entre de novo.", 401);
    const { id } = await ctx.params;
    const session = await captureForUser(id, user.id);
    if (!session) throw new UserError("Sessão não encontrada.");
    const files = session.fileIds.length
      ? (
          await db
            .select({ id: schema.files.id, name: schema.files.originalName, mime: schema.files.mime, key: schema.files.storageKey, visibility: schema.files.visibility })
            .from(schema.files)
            .where(inArray(schema.files.id, session.fileIds))
        ).map(({ key, visibility, ...f }) => ({ ...f, url: visibility === "public" ? publicUrl(key) : null }))
      : [];
    return NextResponse.json(
      { ok: true, expired: session.expiresAt.getTime() < Date.now(), files: session.fileIds.map((fid) => files.find((f) => f.id === fid)).filter(Boolean) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return jsonError(e);
  }
}
