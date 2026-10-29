/**
 * Word → PDF no servidor (o stand não tem o Office): o Chromium abre o .docx com o docx-preview e imprime em
 * PDF com as margens e o tamanho de página do documento. Arial, Calibri e Times vêm como Arimo, Carlito e
 * Tinos, que têm as mesmas medidas, para o texto cair nas mesmas linhas. Se falhar, quem chama fica com o Word.
 */
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Browser } from "puppeteer-core";

const asset = (p: string) => readFileSync(path.join(process.cwd(), "node_modules", p));

let html: string | null = null;
function pageHtml(): string {
  if (html) return html;
  const faces = (family: string, pkg: string) =>
    (["400", "700"] as const)
      .flatMap((w) => (["normal", "italic"] as const).map((s) => [w, s] as const))
      .map(
        ([w, s]) =>
          `@font-face{font-family:"${family}";font-weight:${w};font-style:${s};src:url(data:font/woff2;base64,${asset(`@fontsource/${pkg}/files/${pkg}-latin-${w}-${s}.woff2`).toString("base64")}) format("woff2")}`,
      )
      .join("");
  const fonts = faces("Arial", "arimo") + faces("Helvetica", "arimo") + faces("Calibri", "carlito") + faces("Times New Roman", "tinos");
  html = `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}
html,body{margin:0;padding:0;background:#fff}
.docx-wrapper{background:#fff!important;padding:0!important;display:block!important}
.docx-wrapper>section.docx{box-shadow:none!important;margin:0!important;break-after:page}
.docx-wrapper>section.docx:last-child{break-after:auto}
</style></head><body><div id="doc"></div><script>${asset("jszip/dist/jszip.min.js")}</script><script>${asset("docx-preview/dist/docx-preview.min.js")}</script></body></html>`;
  return html;
}

const LOCAL_BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  const exe = LOCAL_BROWSERS.find((p): p is string => Boolean(p) && existsSync(p!));
  if (!exe) throw new Error("Não há Chrome nem Edge neste computador para gerar o PDF.");
  return puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
}

// Um só navegador por instância do servidor (abrir o Chromium demora uns segundos).
let browser: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  const current = browser ? await browser.catch(() => null) : null;
  if (current?.connected) return current;
  browser = launch();
  browser.catch(() => (browser = null));
  return browser;
}

export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setContent(pageHtml(), { waitUntil: "load" });
    await page.evaluate(async (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const lib = (window as unknown as { docx: { renderAsync: (data: Uint8Array, body: HTMLElement, style: null, opts: object) => Promise<void> } }).docx;
      await lib.renderAsync(bytes, document.getElementById("doc")!, null, {
        inWrapper: true,
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        renderHeaders: true,
        renderFooters: true,
        useBase64URL: true,
      });
      // O docx-preview desenha cada secção como uma folha com as margens em padding. Passa-se isso para o
      // @page, para o Chrome repetir as margens em todas as páginas quando o texto passa para a seguinte.
      const sec = document.querySelector<HTMLElement>(".docx-wrapper > section.docx");
      if (sec) {
        const cs = getComputedStyle(sec);
        const size = sec.style.width && sec.style.minHeight ? `${sec.style.width} ${sec.style.minHeight}` : "A4";
        const style = document.createElement("style");
        style.textContent = `@page{size:${size};margin:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}}
.docx-wrapper>section.docx{padding:0!important;width:auto!important;min-height:0!important;height:auto!important;overflow:visible!important}`;
        document.head.appendChild(style);
      }
      await document.fonts.ready;
    }, docx.toString("base64"));
    return Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true }));
  } finally {
    await page.close().catch(() => {});
  }
}

/** Nome do ficheiro em PDF a partir do nome do Word. */
export const pdfName = (name: string) => name.replace(/\.docx$/i, "") + ".pdf";
