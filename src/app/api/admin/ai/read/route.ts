import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { kindFromAi, DOCUMENT_KINDS } from "@/lib/document-kinds";
import { readCarPhotos, readDeclarationDocuments, readImportDocuments, readPartyDocuments, readPersonDocuments, readRequesterDocuments, readVehicleDocuments, prepareForAi } from "@/server/ai/documents";
import { aiModelLabel } from "@/server/ai/provider";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { assertSameOrigin, jsonError } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { getObject } from "@/server/storage";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MODE_LABEL = { vehicle: "viatura", person: "cliente", import: "importação", requester: "requerente", parties: "compra e venda", carphoto: "foto do carro", declaration: "declaração" } as const;

const bodySchema = z.object({
  mode: z.enum(["vehicle", "person", "import", "requester", "parties", "carphoto", "declaration"]),
  fileIds: z.array(z.string().max(60)).min(1).max(8),
});

/**
 * Lê ficheiros já carregados (rota /api/admin/documents) com IA e devolve uma proposta de campos.
 * Nada é gravado na viatura/cliente aqui: a pessoa revê e aplica.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { mode, fileIds } = bodySchema.parse(await req.json());
    // Foto do carro: fotografias da viatura (públicas) ao dar entrada; documentos: ficheiros privados.
    const user = await assertPermission(mode === "carphoto" ? "vehicles.edit" : "documents.upload");
    if (mode !== "carphoto") await assertPermission("documents.view"); // lê ficheiros já guardados
    const limit = await rateLimit(`ai:${user.id}`, 60, 60 * 60 * 1000);
    if (!limit.ok) throw new UserError("Atingiu o limite de leituras por hora. Tente mais tarde.");

    const files = await db.select().from(schema.files).where(and(inArray(schema.files.id, fileIds), eq(schema.files.visibility, mode === "carphoto" ? "public" : "private")));
    if (files.length !== new Set(fileIds).size) throw new UserError("Algum ficheiro não foi encontrado.");
    const parts = [];
    for (const f of files) {
      const data = await getObject(f.storageKey);
      if (!data) throw new UserError(`O ficheiro ${f.originalName} não está disponível.`);
      parts.push(await prepareForAi(data, f.mime));
    }

    const docs = await db.select().from(schema.documents).where(inArray(schema.documents.fileId, fileIds));
    if (docs.length) await db.update(schema.documents).set({ extractionStatus: "pending" }).where(inArray(schema.documents.fileId, fileIds));

    try {
      const proposal =
        mode === "carphoto"
          ? await readCarPhotos(parts)
          : mode === "declaration"
          ? await readDeclarationDocuments(parts)
          : mode === "vehicle"
          ? await readVehicleDocuments(parts)
          : mode === "person"
            ? await readPersonDocuments(parts)
            : mode === "import"
              ? await readImportDocuments(parts)
              : mode === "parties"
                ? await readPartyDocuments(parts)
                : await readRequesterDocuments(parts);
      for (const d of docs) {
        const detected = proposal.documents.length === 1 && d.kind === "outro" ? kindFromAi(proposal.documents[0]) : d.kind;
        await db
          .update(schema.documents)
          .set({
            extracted: { summary: proposal.summary, ...proposal.fields },
            extractionStatus: "done",
            kind: detected,
            label: DOCUMENT_KINDS[detected as keyof typeof DOCUMENT_KINDS] ?? d.label,
          })
          .where(eq(schema.documents.id, d.id));
      }
      await audit(user, {
        action: "ai.read",
        entityType: docs[0]?.ownerType ?? "upload",
        entityId: docs[0]?.ownerId ?? null,
        summary: `Leitura com IA (${MODE_LABEL[mode]}, ${files.length} ficheiro(s)): ${proposal.summary || "sem resumo"}`,
      });
      return NextResponse.json({ ok: true, proposal, model: aiModelLabel() });
    } catch (e) {
      if (docs.length) await db.update(schema.documents).set({ extractionStatus: "failed" }).where(inArray(schema.documents.fileId, fileIds));
      throw e;
    }
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
    return jsonError(e);
  }
}
