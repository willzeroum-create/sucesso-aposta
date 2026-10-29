import { ASSUNCAO_SAMPLE } from "@/lib/assuncao";
import { getAssuncaoFixes } from "@/server/assuncao";
import { assuncaoDocx } from "@/server/assuncao-docx";
import { AuthError, assertPermission } from "@/server/auth/session";
import { docxToPdf } from "@/server/docx-pdf";

export const dynamic = "force-dynamic";

/** Contrato de assunção com dados de exemplo e as correções de Configurações, para conferir o texto. */
export async function GET() {
  try {
    await assertPermission("site.edit");
  } catch (e) {
    return new Response(e instanceof AuthError ? e.message : "Erro", { status: e instanceof AuthError ? e.status : 500 });
  }
  const pdf = await docxToPdf(await assuncaoDocx(ASSUNCAO_SAMPLE, await getAssuncaoFixes()));
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="contrato-assuncao-exemplo.pdf"', "Cache-Control": "no-store" },
  });
}
