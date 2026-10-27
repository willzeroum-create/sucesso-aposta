/**
 * Camada única de IA (servidor). Portada do LegalCar (ia.ts), que já corre em produção.
 *
 *   IA_PROVIDER=gemini | anthropic  → força o fornecedor
 *   sem IA_PROVIDER                 → Gemini se houver GEMINI_API_KEY, senão Anthropic
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type AiProvider = "anthropic" | "gemini";
export type AiPart = { text: string } | { base64: string; mime: string };

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

export class AiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function aiProvider(): AiProvider | null {
  const forced = (process.env.IA_PROVIDER || "").trim().toLowerCase();
  if (forced === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (forced === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function aiModelLabel(): string | null {
  const p = aiProvider();
  return p === "gemini" ? `Gemini (${GEMINI_MODEL})` : p === "anthropic" ? `Claude (${ANTHROPIC_MODEL})` : null;
}

export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Sem a data de hoje, os modelos tendem a "corrigir" anos recentes. */
function fidelityRule(): string {
  const iso = new Date().toISOString().slice(0, 10);
  return `Data de hoje: ${iso}. Documentos com datas deste ano ou recentes são normais. Copia datas, anos, números de documento, matrículas, NIF e VIN EXATAMENTE como estão escritos — nunca alteres nem "corrijas" um ano ou um número. Nunca inventes valores: usa "" quando não conseguires ler.`;
}

function transient(e: unknown): boolean {
  if (!(e instanceof AiError)) return false;
  if ([429, 500, 502, 503, 504].includes(e.status)) return true;
  return /high demand|overloaded|unavailable|try again later/i.test(e.message);
}

async function withRetries<T>(fn: () => Promise<T>, waits: number[]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= waits.length || !transient(e)) throw e;
      await new Promise((r) => setTimeout(r, waits[i]));
    }
  }
}

export interface JsonRequest {
  system: string;
  parts: AiPart[];
  /** Esquema JSON da resposta (structured outputs na Anthropic; instrução no Gemini). */
  schema: Record<string, unknown>;
  /** Regra de fidelidade a documentos (datas, NIF, VIN). Desligada na ajuda do painel, que não lê documentos. */
  fidelity?: boolean;
}

export async function requestJson(req: JsonRequest): Promise<Record<string, unknown>> {
  const provider = aiProvider();
  if (!provider)
    throw new AiError(
      "A leitura por IA não está configurada. Defina GEMINI_API_KEY ou ANTHROPIC_API_KEY no servidor.",
      503,
    );
  const system = req.fidelity === false ? req.system : `${req.system}\n\n${fidelityRule()}`;
  const text =
    provider === "gemini"
      ? await withRetries(() => callGemini(system, req), [2000, 6000])
      : await callAnthropic(system, req);
  const json = extractJson(text);
  if (!json) throw new AiError("A IA não devolveu dados legíveis. Tente outra fotografia.", 422);
  return json;
}

/* ── Anthropic ── */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

async function callAnthropic(system: string, req: JsonRequest): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180_000, maxRetries: 2 });
  const files: Anthropic.Beta.BetaContentBlockParam[] = [];
  const texts: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const part of req.parts) {
    if ("text" in part) {
      texts.push({ type: "text", text: part.text });
    } else if (part.mime === "application/pdf") {
      files.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: part.base64 } });
    } else {
      const mime = part.mime === "image/jpg" ? "image/jpeg" : part.mime;
      if (!IMAGE_TYPES.includes(mime as ImageType))
        throw new AiError("Formato não suportado. Envie uma fotografia (JPG, PNG, WebP) ou um PDF.", 400);
      files.push({ type: "image", source: { type: "base64", media_type: mime as ImageType, data: part.base64 } });
    }
  }

  try {
    const res = await client.beta.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      system,
      // Ficheiros antes do texto, como recomenda a documentação.
      messages: [{ role: "user", content: [...files, ...texts] }],
      output_config: { effort: "low", format: { type: "json_schema", schema: req.schema } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new AiError("A IA recusou analisar este ficheiro.", 422);
    if (res.stop_reason === "max_tokens") throw new AiError("A resposta da IA ficou incompleta. Tente de novo.", 502);
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("Chave da Anthropic inválida.", 503);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Limite de pedidos à IA atingido. Tente daqui a pouco.", 429);
    if (e instanceof Anthropic.APIError) throw new AiError(`IA (Anthropic): ${e.message}`, e.status ?? 500);
    throw new AiError(e instanceof Error ? e.message : "Erro na IA.", 500);
  }
}

/* ── Google Gemini (REST) ── */

async function callGemini(system: string, req: JsonRequest): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const parts = req.parts.map((p) =>
    "text" in p
      ? { text: p.text }
      : { inlineData: { mimeType: p.mime === "image/jpg" ? "image/jpeg" : p.mime, data: p.base64 } },
  );
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `${system}\n\nResponde APENAS com um objeto JSON válido com exatamente este esquema: ${JSON.stringify(req.schema)}`,
            },
          ],
        },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new AiError("Sem ligação ao Gemini.", 502);
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  if (!res.ok) throw new AiError(`IA (Gemini): ${json.error?.message ?? `HTTP ${res.status}`}`, res.status);
  if (json.promptFeedback?.blockReason) throw new AiError("A IA recusou analisar este ficheiro.", 422);
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text)
    throw new AiError(`A IA não devolveu resposta${cand?.finishReason ? ` (${cand.finishReason})` : ""}.`, 422);
  return text;
}
