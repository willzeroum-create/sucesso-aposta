/** Resultado das Server Actions do painel (serializável para o cliente). */
export type ActionResult<T = void> =
  | { ok: true; message?: string; data: T }
  | { ok: false; error: string; fields?: Record<string, string> };
