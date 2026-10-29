/**
 * Editar o texto de um modelo Word no painel, sem o Office: cada parágrafo (também os das tabelas) aparece
 * como uma caixa de texto. Ao gravar, o parágrafo alterado fica com a letra do seu início (negrito, tamanho…)
 * e o resto do documento (tabelas, margens, logótipo) não muda. Os campos {{...}} continuam a funcionar.
 */
import "server-only";
import { DOMParser, XMLSerializer, type Element, type Node } from "@xmldom/xmldom";
import PizZip from "pizzip";

export interface DocxParagraph {
  index: number;
  text: string;
  /** Dentro de uma tabela (ex.: rótulo de um quadro). */
  inTable: boolean;
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function load(buffer: Buffer) {
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")?.asText();
  if (!xml) throw new Error("O ficheiro não é um documento Word.");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  // Só se editam parágrafos simples: os que têm imagens ou caixas de texto ficam como estão.
  const all = Array.from(doc.getElementsByTagNameNS(W, "p")) as Element[];
  const editable = all.filter((p) => !p.getElementsByTagNameNS(W, "drawing").length && !p.getElementsByTagNameNS(W, "pict").length && !p.getElementsByTagNameNS(W, "txbxContent").length);
  return { zip, doc, editable };
}

function insideTable(p: Element): boolean {
  for (let n: Node | null = p.parentNode; n; n = n.parentNode) if ((n as Element).localName === "tc") return true;
  return false;
}

/** Texto do parágrafo: tabulações como \t e quebras de linha como \n. */
function paragraphText(p: Element): string {
  let out = "";
  const walk = (n: Node) => {
    const el = n as Element;
    if (el.namespaceURI === W) {
      if (el.localName === "t") return void (out += el.textContent ?? "");
      if (el.localName === "tab" && (el.parentNode as Element)?.localName === "r") return void (out += "\t");
      if (el.localName === "br" || el.localName === "cr") return void (out += "\n");
      if (el.localName === "pPr" || el.localName === "rPr" || el.localName === "del") return;
    }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  };
  walk(p);
  return out;
}

export function docxParagraphs(buffer: Buffer): DocxParagraph[] {
  const { editable } = load(buffer);
  return editable.map((p, index) => ({ index, text: paragraphText(p), inTable: insideTable(p) })).filter((p) => p.text.trim() !== "");
}

/** Troca o texto dos parágrafos indicados (pela posição devolvida em docxParagraphs). */
export function docxSetParagraphs(buffer: Buffer, edits: { index: number; text: string }[]): Buffer {
  const { zip, doc, editable } = load(buffer);
  for (const { index, text } of edits) {
    const p = editable[index];
    if (!p || paragraphText(p) === text) continue;
    const firstRun = p.getElementsByTagNameNS(W, "r")[0] as Element | undefined;
    const rPr = firstRun?.getElementsByTagNameNS(W, "rPr")[0] as Element | undefined;
    // Tira tudo menos as propriedades do parágrafo (alinhamento, espaçamento) e volta a escrever o texto.
    for (let c = p.firstChild; c; ) {
      const next = c.nextSibling;
      if ((c as Element).localName !== "pPr") p.removeChild(c);
      c = next;
    }
    for (const part of text.split(/(\t|\n)/)) {
      if (!part) continue;
      const r = doc.createElementNS(W, "w:r");
      if (rPr) r.appendChild(rPr.cloneNode(true));
      if (part === "\t") r.appendChild(doc.createElementNS(W, "w:tab"));
      else if (part === "\n") r.appendChild(doc.createElementNS(W, "w:br"));
      else {
        const t = doc.createElementNS(W, "w:t");
        t.setAttribute("xml:space", "preserve");
        t.appendChild(doc.createTextNode(part));
        r.appendChild(t);
      }
      p.appendChild(r);
    }
  }
  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
