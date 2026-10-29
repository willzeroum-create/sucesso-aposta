import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthError, assertPermission } from "@/server/auth/session";
import { DOCX_MIME } from "@/server/docx-template";
import { docxToPdf, pdfName } from "@/server/docx-pdf";
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
  const params = new URL(req.url).searchParams;
  const download = params.has("download");
  let body: Buffer = data;
  let mime = file.mime;
  let original = file.originalName;
  // Quem não tem o Office: um Word abre já em PDF (com ?word=1 sai o Word tal como está).
  if (file.mime === DOCX_MIME && !params.has("word")) {
    const pdf = await docxToPdf(data).catch((e) => (console.error("Word → PDF falhou:", e), null));
    if (pdf) {
      body = pdf;
      mime = "application/pdf";
      original = pdfName(original);
    }
  }
  // Nome com acentos para quem descarrega (filename*) e uma versão sem acentos para navegadores antigos.
  const name = original.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.\- ()]/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(original)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
