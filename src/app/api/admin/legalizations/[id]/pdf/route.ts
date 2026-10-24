import { and, eq, inArray } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { db, schema } from "@/db";
import { assertPermission } from "@/server/auth/session";
import { jsonError } from "@/server/http";
import { getObject } from "@/server/storage";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Junta fotografias/PDF de um processo num só PDF (o portal do IMT só aceita PDF).
 * GET ?ids=a,b,c — pela ordem indicada; cada fotografia ocupa uma página A4.
 * &nome=FATURA — nome do ficheiro sem acentos nem espaços (o portal da DAV exige), ex. FATURA_AB123CD.pdf.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/legalizations/[id]/pdf">) {
  try {
    await assertPermission("forms.generate");
    await assertPermission("documents.view");
    const { id } = await ctx.params;
    const [row] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.id, id)).limit(1);
    if (!row) throw new UserError("Processo não encontrado.");
    const docs = await db
      .select({ fileId: schema.documents.fileId })
      .from(schema.documents)
      .where(and(eq(schema.documents.ownerType, "legalization"), eq(schema.documents.ownerId, id)));
    const allowed = new Set([...row.fileIds, ...(row.modelo9FileId ? [row.modelo9FileId] : []), ...docs.map((d) => d.fileId)]);
    const params = new URL(req.url).searchParams;
    const ids = (params.get("ids") ?? "").split(",").filter((x) => allowed.has(x)).slice(0, 20);
    if (!ids.length) throw new UserError("Escolha pelo menos um documento.");
    const files = await db.select().from(schema.files).where(inArray(schema.files.id, ids));

    const out = await PDFDocument.create();
    const A4 = [595.28, 841.89] as const;
    for (const fid of ids) {
      const f = files.find((x) => x.id === fid);
      if (!f) continue;
      const data = await getObject(f.storageKey);
      if (!data) continue;
      if (f.mime === "application/pdf") {
        const src = await PDFDocument.load(data, { ignoreEncryption: true });
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        continue;
      }
      if (!f.mime.startsWith("image/")) continue;
      // Endireita (EXIF), limita o tamanho e converte para JPEG — o PDF fica leve para o portal.
      const jpg = await sharp(data).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const img = await out.embedJpg(jpg);
      const landscape = img.width > img.height;
      const [pw, ph] = landscape ? [A4[1], A4[0]] : A4;
      const margin = 24;
      const scale = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
      const page = out.addPage([pw, ph]);
      page.drawImage(img, { x: (pw - img.width * scale) / 2, y: (ph - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
    }
    if (!out.getPageCount()) throw new UserError("Os documentos escolhidos não estão disponíveis.");
    const v = row.vehicle ?? {};
    const plain = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "").toUpperCase();
    const name = `${plain(params.get("nome") || "DOCUMENTOS") || "DOCUMENTOS"}_${plain(v.foreignPlate || v.vin || "viatura")}.pdf`;
    return new Response(new Uint8Array(await out.save()), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return jsonError(e);
  }
}
