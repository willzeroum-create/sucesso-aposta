import "server-only";
import { db, schema } from "@/db";
import { newId } from "./ids";
import { clientIp, type SessionUser } from "./auth/session";

/** Campos nunca copiados para o registo (dados de identificação e segredos). */
const REDACTED = new Set([
  "passwordHash", "nif", "idDocumentNumber", "birthDate", "drivingLicenseNumber", "address", "postalCode",
  "phone", "email", "phoneNormalized", "emailNormalized", "ipHash",
]);

export type Changes = Record<string, [unknown, unknown]>;

/** Diferenças campo a campo entre dois registos; campos sensíveis aparecem só como "alterado". */
export function diff<T extends Record<string, unknown>>(before: Partial<T> | null, after: Partial<T>): Changes {
  const out: Changes = {};
  for (const key of Object.keys(after)) {
    if (key === "updatedAt" || key === "createdAt") continue;
    const a = before?.[key] ?? null;
    const b = after[key] ?? null;
    const same = a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : JSON.stringify(a) === JSON.stringify(b);
    if (same) continue;
    out[key] = REDACTED.has(key) ? ["•••", "alterado"] : [a, b];
  }
  return out;
}

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Changes | null;
}

/** Regista quem fez o quê. Nunca falha a operação principal por causa do registo. */
export async function audit(actor: Pick<SessionUser, "id" | "name"> | null, input: AuditInput): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      id: newId("log"),
      userId: actor?.id ?? null,
      userName: actor?.name ?? "Sistema",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary.slice(0, 500),
      changes: input.changes && Object.keys(input.changes).length ? input.changes : null,
      ip: await clientIp().catch(() => null),
    });
  } catch (error) {
    console.error("[audit] falha ao registar", input.action, error instanceof Error ? error.message : error);
  }
}
