import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { DOCUMENT_KINDS } from "@/lib/document-kinds";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { assertSameOrigin, jsonError, readFiles } from "@/server/http";
import { newId } from "@/server/ids";
import { storePrivateDocument } from "@/server/storage";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST multipart: ownerType (vehicle | customer | none), ownerId, kind, files[].
 * ownerType=none guarda ficheiros soltos (antes de criar a viatura ou o cliente) e devolve os ids.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("documents.upload");
    const form = await req.formData();
    const ownerType = String(form.get("ownerType") ?? "none");
    const ownerId = String(form.get("ownerId") ?? "");
    const kindRaw = String(form.get("kind") ?? "outro");
    const kind = kindRaw in DOCUMENT_KINDS ? kindRaw : "outro";
    if (!["vehicle", "customer", "none"].includes(ownerType)) throw new UserError("Destino inválido.");
    if (ownerType === "vehicle") {
      const [v] = await db.select({ id: schema.vehicles.id }).from(schema.vehicles).where(eq(schema.vehicles.id, ownerId)).limit(1);
      if (!v) throw new UserError("Viatura não encontrada.");
    }
    if (ownerType === "customer") {
      await assertPermission("customers.edit");
      const [c] = await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, ownerId)).limit(1);
      if (!c) throw new UserError("Cliente não encontrado.");
    }
    const files = await readFiles(form, "files", 10);
    const out: { fileId: string; documentId: string | null; name: string; mime: string }[] = [];
    for (const f of files) {
      const stored = await storePrivateDocument(f.buffer, f.name, user.id);
      let documentId: string | null = null;
      if (ownerType !== "none") {
        documentId = newId("doc");
        await db.insert(schema.documents).values({
          id: documentId,
          ownerType: ownerType as "vehicle" | "customer",
          ownerId,
          kind,
          label: DOCUMENT_KINDS[kind as keyof typeof DOCUMENT_KINDS],
          fileId: stored.id,
          uploadedBy: user.id,
        });
      }
      out.push({ fileId: stored.id, documentId, name: f.name, mime: stored.mime });
    }
    if (ownerType !== "none") {
      await audit(user, {
        action: "document.upload",
        entityType: ownerType,
        entityId: ownerId,
        summary: `Carregou ${out.length} documento(s): ${DOCUMENT_KINDS[kind as keyof typeof DOCUMENT_KINDS]}`,
      });
      revalidatePath(ownerType === "vehicle" ? `/painel/viaturas/${ownerId}` : `/painel/clientes/${ownerId}`);
    }
    return NextResponse.json({ ok: true, files: out });
  } catch (e) {
    return jsonError(e);
  }
}
