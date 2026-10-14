import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { DOCX_MIME, inspectDocx, TemplateFileError } from "@/server/docx-template";
import { getTemplateFiles } from "@/server/forms";
import { assertSameOrigin, jsonError, readFiles } from "@/server/http";
import { writeSetting } from "@/server/settings";
import { storeTemplateFile } from "@/server/storage";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";

/** Exemplos em Word incluídos no projeto (docs/modelos), para descarregar, adaptar e voltar a carregar. */
const EXAMPLES: Partial<Record<TemplateId, string>> = {
  contrato_compra_venda: "contrato-compra-venda.docx",
  termo_responsabilidade: "termo-responsabilidade.docx",
};

function templateId(id: string): TemplateId {
  if (!TEMPLATE_IDS.includes(id as TemplateId)) throw new UserError("Modelo inválido.");
  return id as TemplateId;
}

/** GET → descarrega o modelo Word ativo; ?exemplo=1 → o exemplo do projeto. */
export async function GET(req: Request, ctx: RouteContext<"/api/admin/templates/[id]">) {
  try {
    await assertPermission("forms.generate");
    const id = templateId((await ctx.params).id);
    if (new URL(req.url).searchParams.has("exemplo")) {
      const name = EXAMPLES[id];
      if (!name) throw new UserError("Não há exemplo em Word para este documento.");
      const data = await readFile(path.join(process.cwd(), "docs", "modelos", name));
      return new Response(new Uint8Array(data), {
        headers: { "Content-Type": DOCX_MIME, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
      });
    }
    const info = (await getTemplateFiles())[id];
    if (!info) throw new UserError("Este documento ainda não tem modelo Word.");
    return NextResponse.redirect(new URL(`/api/admin/files/${info.fileId}?download=1`, req.url));
  } catch (e) {
    return jsonError(e);
  }
}

/** POST multipart (file) → valida e ativa o modelo Word deste documento. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/templates/[id]">) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("site.edit");
    const id = templateId((await ctx.params).id);
    const [file] = await readFiles(await req.formData(), "file", 1);
    if (!/\.docx$/i.test(file.name)) throw new UserError("Carregue o documento em formato Word (.docx).");
    let inspected;
    try {
      inspected = inspectDocx(file.buffer);
    } catch (e) {
      if (e instanceof TemplateFileError) throw new UserError(e.message);
      throw e;
    }
    if (!inspected.fields.length) throw new UserError("O documento não tem nenhum campo {{...}}. Escreva, por exemplo, {{cliente.nome}} onde deve aparecer o nome do comprador.");
    const stored = await storeTemplateFile(file.buffer, file.name, user.id);
    const all = await getTemplateFiles();
    all[id] = { fileId: stored.id, name: file.name, uploadedAt: new Date().toISOString(), uploadedBy: user.name, fields: inspected.fields };
    await writeSetting("templateFiles", all, user.id);
    await audit(user, { action: "settings.template_file", entityType: "template", entityId: id, summary: `Carregou o modelo Word "${file.name}" (${inspected.fields.length} campos)` });
    revalidatePath("/painel/configuracoes");
    return NextResponse.json({ ok: true, fields: inspected.fields, unknown: inspected.unknown });
  } catch (e) {
    return jsonError(e);
  }
}

/** DELETE → deixa de usar o modelo Word (volta ao texto-base em PDF). */
export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/templates/[id]">) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("site.edit");
    const id = templateId((await ctx.params).id);
    const all = await getTemplateFiles();
    const old = all[id];
    delete all[id];
    await writeSetting("templateFiles", all, user.id);
    if (old) await audit(user, { action: "settings.template_file_remove", entityType: "template", entityId: id, summary: `Deixou de usar o modelo Word "${old.name}"` });
    revalidatePath("/painel/configuracoes");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
