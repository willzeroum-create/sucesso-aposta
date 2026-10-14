import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthError, assertPermission } from "@/server/auth/session";
import { getObject } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Documentos privados: só com sessão e permissão de ver documentos. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/files/[id]">) {
  try {
    await assertPermission("documents.view");
  } catch (e) {
    return new Response(e instanceof AuthError ? e.message : "Erro", { status: e instanceof AuthError ? e.status : 500 });
  }
  const { id } = await ctx.params;
  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
  if (!file) return new Response("Ficheiro não encontrado.", { status: 404 });
  const data = await getObject(file.storageKey);
  if (!data) return new Response("Ficheiro em falta no armazenamento.", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  const name = file.originalName.replace(/[^\w.\- ()]/g, "_");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
