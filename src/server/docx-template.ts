/**
 * Modelos Word (.docx) do stand: o documento real (contrato, termo…) com campos {{...}}.
 * Cada venda gera uma cópia preenchida, mantendo o formato, o logótipo e as cláusulas do original.
 */
import "server-only";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PLACEHOLDERS } from "@/lib/form-templates";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KNOWN = new Set([...PLACEHOLDERS.map((p) => p.key), "documento.referencia"]);
const BLANK = "________________";

export class TemplateFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateFileError";
  }
}

function open(buffer: Buffer): PizZip {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new TemplateFileError("O ficheiro não é um documento Word (.docx). Se for .doc antigo, guarde-o como .docx no Word.");
  let zip: PizZip;
  try {
    zip = new PizZip(buffer);
  } catch {
    throw new TemplateFileError("Não foi possível abrir o documento Word.");
  }
  if (!zip.file("word/document.xml")) throw new TemplateFileError("O ficheiro não é um documento Word (.docx).");
  return zip;
}

function engine(zip: PizZip, values?: Record<string, string>) {
  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    parser: (tag: string) => ({ get: () => (values ? values[tag.trim()]?.trim() || BLANK : "") }),
    nullGetter: () => BLANK,
  });
}

function explain(e: unknown): string {
  const errors = (e as { properties?: { errors?: { properties?: { explanation?: string; xtag?: string } }[] } })?.properties?.errors;
  if (errors?.length) return errors.slice(0, 3).map((x) => x.properties?.explanation ?? "Campo mal escrito").join(" ");
  return e instanceof Error ? e.message : "Erro no modelo.";
}

/** Verifica o modelo e devolve os campos usados (e os desconhecidos, para avisar). */
export function inspectDocx(buffer: Buffer): { fields: string[]; unknown: string[] } {
  const zip = open(buffer);
  let text: string;
  try {
    text = engine(zip).getFullText();
  } catch (e) {
    throw new TemplateFileError(`O modelo tem um campo mal escrito: ${explain(e)} Use o formato {{cliente.nome}}.`);
  }
  const fields = [...new Set([...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1]))];
  return { fields, unknown: fields.filter((f) => !KNOWN.has(f)) };
}

export function fillDocx(buffer: Buffer, values: Record<string, string>): Buffer {
  const doc = engine(open(buffer), values);
  try {
    doc.render();
  } catch (e) {
    throw new TemplateFileError(`Não foi possível preencher o modelo: ${explain(e)}`);
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
