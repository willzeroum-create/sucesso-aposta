import "server-only";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { AuthError } from "./auth/session";
import { UploadError } from "./storage";
import { AiError } from "./ai/provider";

export class UserError extends Error {
  constructor(message: string, public fields?: Record<string, string>) {
    super(message);
    this.name = "UserError";
  }
}

export function zodFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/** Envolve uma Server Action: erros conhecidos viram mensagens; o resto é registado e escondido. */
export async function run<T>(fn: () => Promise<T>, success?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, message: success, data };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: "Reveja os campos assinalados.", fields: zodFields(e) };
    if (e instanceof UserError) return { ok: false, error: e.message, fields: e.fields };
    if (e instanceof AuthError || e instanceof UploadError || e instanceof AiError) return { ok: false, error: e.message };
    // redirect()/notFound() do Next lançam erros especiais que têm de propagar.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest: unknown }).digest === "string" && /NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test((e as { digest: string }).digest)) throw e;
    console.error("[action]", e);
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente; se persistir, contacte o administrador." };
  }
}

/* Coerções para FormData / JSON vindos do navegador */
export const optText = (max = 500) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v ?? ""), z.string().max(max, `Máximo ${max} caracteres.`)).transform((v) => v || null);
export const reqText = (label: string, max = 200) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().min(1, `Indique ${label}.`).max(max, `Máximo ${max} caracteres.`));
export const optInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? Number(v.replace(/[\s.]/g, "").replace(",", ".")) : v),
    z.number({ error: "Número inválido." }).int("Use um número inteiro.").min(min, `Mínimo ${min}.`).max(max, `Máximo ${max}.`).nullable(),
  );
export const optMoney = () =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? Number(v.replace(/[\s€]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) : v),
    z.number({ error: "Valor inválido." }).min(0, "Valor inválido.").max(100_000_000, "Valor demasiado alto.").nullable(),
  );
export const optDate = () =>
  z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable());
