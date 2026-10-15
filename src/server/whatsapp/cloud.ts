/**
 * WhatsApp Cloud API (Graph API da Meta) — envio de mensagens, botões, listas e descarga de média.
 * Portado do projeto "brm veiculos". O token nunca aparece em logs nem em mensagens de erro.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const TIMEOUT = 15_000;
const MAX_TEXT = 4096;
const version = () => process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export class WhatsAppError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "WhatsAppError";
  }
}

async function graphPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  if (!whatsappConfigured()) throw new WhatsAppError("WhatsApp não configurado (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).");
  const res = await fetch(`https://graph.facebook.com/${version()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  }).catch(() => {
    throw new WhatsAppError("Sem ligação à API do WhatsApp.");
  });
  const data = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
  if (!res.ok) throw new WhatsAppError(`WhatsApp recusou (HTTP ${res.status}${data?.error?.code ? `, código ${data.error.code}` : ""}): ${data?.error?.message ?? "erro"}`, res.status);
  return data;
}

export type Button = { id: string; title: string };
export type ListRow = { id: string; title: string; description?: string };
export type OutMessage =
  | { text: string }
  | { text: string; buttons: Button[] }
  | { text: string; list: { button: string; rows: ListRow[] } };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Envia texto, botões (até 3) ou lista (até 10 linhas), respeitando os limites da Meta. */
export async function sendWhatsApp(to: string, msg: OutMessage): Promise<void> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: to.replace(/\D/g, "") };
  if ("buttons" in msg) {
    await graphPost("messages", {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: clip(msg.text, 1024) },
        action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: clip(b.title, 20) } })) },
      },
    });
    return;
  }
  if ("list" in msg) {
    await graphPost("messages", {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: clip(msg.text, 1024) },
        action: {
          button: clip(msg.list.button, 20),
          sections: [{ title: "Opções", rows: msg.list.rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: clip(r.title, 24), ...(r.description ? { description: clip(r.description, 72) } : {}) })) }],
        },
      },
    });
    return;
  }
  for (let rest = msg.text.trim(); rest; rest = rest.slice(MAX_TEXT)) {
    await graphPost("messages", { ...base, type: "text", text: { body: rest.slice(0, MAX_TEXT), preview_url: false } });
  }
}

/** Descarrega uma média recebida (foto, PDF…). A Meta só a guarda durante 30 dias. */
export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const auth = { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` };
  const meta = await fetch(`https://graph.facebook.com/${version()}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const info = (await meta.json().catch(() => null)) as { url?: string; mime_type?: string; file_size?: number } | null;
  if (!meta.ok || !info?.url) throw new WhatsAppError("Não foi possível obter o ficheiro do WhatsApp.");
  if ((info.file_size ?? 0) > 25 * 1024 * 1024) throw new WhatsAppError("Ficheiro demasiado grande.");
  const url = new URL(info.url);
  if (!/(^|\.)fbcdn\.net$|(^|\.)whatsapp\.net$|(^|\.)facebook\.com$/.test(url.hostname)) throw new WhatsAppError("Origem de ficheiro inesperada.");
  const file = await fetch(url, { headers: auth, signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!file.ok) throw new WhatsAppError("Falha ao descarregar o ficheiro do WhatsApp.");
  return { buffer: Buffer.from(await file.arrayBuffer()), mime: info.mime_type ?? file.headers.get("content-type") ?? "application/octet-stream" };
}

/** Confere `x-hub-signature-256` (HMAC SHA-256 do corpo com o App Secret). */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("sha256=")) return false;
  const received = Buffer.from(header.slice(7).trim(), "hex");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/* ── Webhook → mensagens normalizadas ── */

export type Incoming = {
  id: string;
  phone: string;
  name: string;
  type: "text" | "image" | "document" | "reply" | "other";
  text?: string;
  /** id do botão/linha escolhido */
  replyId?: string;
  mediaId?: string;
  mime?: string;
  filename?: string;
  caption?: string;
};

const media = z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional(), filename: z.string().optional() });
const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: media.optional(),
  document: media.optional(),
  button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
    })
    .optional(),
});

export function parseWebhook(payload: unknown): Incoming[] {
  const out: Incoming[] = [];
  const entries = (payload as { entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: unknown[] } }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length || (change.field && change.field !== "messages")) continue;
      const target = value.metadata?.phone_number_id;
      if (target && process.env.WHATSAPP_PHONE_NUMBER_ID && target !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
      for (const raw of value.messages) {
        const parsed = messageSchema.safeParse(raw);
        if (!parsed.success) continue;
        const m = parsed.data;
        const name = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? "";
        const base = { id: m.id, phone: m.from.replace(/\D/g, ""), name };
        if (m.type === "text" && m.text) out.push({ ...base, type: "text", text: m.text.body });
        else if (m.type === "image" && m.image) out.push({ ...base, type: "image", mediaId: m.image.id, mime: m.image.mime_type, caption: m.image.caption });
        else if (m.type === "document" && m.document)
          out.push({ ...base, type: "document", mediaId: m.document.id, mime: m.document.mime_type, filename: m.document.filename, caption: m.document.caption });
        else if (m.type === "interactive" && (m.interactive?.button_reply || m.interactive?.list_reply)) {
          const r = m.interactive.button_reply ?? m.interactive.list_reply!;
          out.push({ ...base, type: "reply", replyId: r.id, text: r.title });
        } else if (m.type === "button" && m.button) out.push({ ...base, type: "reply", replyId: m.button.payload, text: m.button.text });
        else out.push({ ...base, type: "other" });
      }
    }
  }
  return out;
}
