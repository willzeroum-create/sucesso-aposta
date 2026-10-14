import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Limite de pedidos partilhado entre instâncias (guardado na base de dados), com incremento atómico.
 * Padrão já usado no projeto "faz tudo".
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfter: number }> {
  const now = Date.now();
  const resetAt = now + windowMs;
  const rows = await db.all<{ count: number; reset_at: number }>(sql`
    INSERT INTO rate_limits (key, count, reset_at) VALUES (${key}, 1, ${resetAt})
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= ${now} THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= ${now} THEN ${resetAt} ELSE rate_limits.reset_at END
    RETURNING count, reset_at
  `);
  const row = rows[0];
  if (Math.random() < 0.02) await db.run(sql`DELETE FROM rate_limits WHERE reset_at <= ${now}`);
  if (!row) return { ok: true, retryAfter: 0 };
  return { ok: Number(row.count) <= limit, retryAfter: Math.max(0, Math.ceil((Number(row.reset_at) - now) / 1000)) };
}
