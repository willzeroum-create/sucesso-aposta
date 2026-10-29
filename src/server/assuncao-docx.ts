/**
 * Word do Contrato de assunção de responsabilidade: o texto vem de assuncaoBlocks() (com as partes
 * opcionais já resolvidas) e os estilos do Word incluído do contrato de consignação.
 */
import "server-only";
import PizZip from "pizzip";
import { assuncaoBlocks, type AssuncaoBlock, type AssuncaoFix, type AssuncaoInput } from "@/lib/assuncao";
import { bundledDocx } from "./forms";

const SIZE = 22; // 11 pt

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function r(text: string, bold = false): string {
  const b = bold ? "<w:b/><w:bCs/>" : "";
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b}<w:sz w:val="${SIZE}"/><w:szCs w:val="${SIZE}"/><w:lang w:val="pt-PT"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}
const tab = `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="${SIZE}"/></w:rPr><w:tab/></w:r>`;

function p(runs: string, o: { before?: number; after?: number; keep?: boolean; firstLine?: number; tabAt?: number } = {}): string {
  let ppr = "";
  if (o.keep) ppr += "<w:keepNext/>";
  if (o.tabAt) ppr += `<w:tabs><w:tab w:val="left" w:pos="${o.tabAt}"/></w:tabs>`;
  ppr += `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="259" w:lineRule="auto"/>`;
  if (o.firstLine) ppr += `<w:ind w:firstLine="${o.firstLine}"/>`;
  return `<w:p><w:pPr>${ppr}</w:pPr>${runs}</w:p>`;
}

function blockXml(b: AssuncaoBlock): string {
  switch (b.kind) {
    case "title":
      return p(r(b.text, true), { after: 0, keep: true });
    case "text":
      return p(r(b.text, b.bold), { before: b.gap ? 240 : 0 });
    case "clause":
      return p(r(`CLÁUSULA ${b.number}`, true), { before: 280, keep: true }) + p(r(b.title), { keep: true });
    case "item":
      return p(r(b.label) + tab + r(b.text), { firstLine: 709, tabAt: 1418 });
    case "signatures":
      return b.labels
        .map((label, i) => p(r("_______________________________________"), { before: i ? 600 : 720, keep: true }) + p(r(label), { keep: i < b.labels.length - 1 }))
        .join("");
  }
}

/** Correções guardadas em Configurações (texto errado → certo), aplicadas a todo o contrato. */
function fixBlock(b: AssuncaoBlock, fixes: AssuncaoFix[]): AssuncaoBlock {
  const fix = (t: string) => fixes.reduce((s, f) => (f.from ? s.split(f.from).join(f.to) : s), t);
  switch (b.kind) {
    case "clause":
      return { ...b, title: fix(b.title) };
    case "item":
      return { ...b, text: fix(b.text) };
    case "signatures":
      return { ...b, labels: b.labels.map(fix) };
    default:
      return { ...b, text: fix(b.text) };
  }
}

export async function assuncaoDocx(input: AssuncaoInput, fixes: AssuncaoFix[] = []): Promise<Buffer> {
  const base = await bundledDocx("contrato_consignacao");
  if (!base) throw new Error("Falta o Word base dos contratos.");
  const zip = new PizZip(base);
  let xml = zip.file("word/document.xml")!.asText();
  const start = xml.indexOf("<w:body>") + "<w:body>".length;
  const sect = xml.indexOf("<w:sectPr");
  xml = xml.slice(0, start) + assuncaoBlocks(input).map((b) => blockXml(fixBlock(b, fixes))).join("") + xml.slice(sect);
  zip.file("word/document.xml", xml);
  const core = zip.file("docProps/core.xml");
  if (core) zip.file("docProps/core.xml", core.asText().replace(/<dc:title>.*?<\/dc:title>/, "").replace(/<dc:creator>.*?<\/dc:creator>/, "<dc:creator>Painel do stand</dc:creator>"));
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
