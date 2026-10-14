import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { ALL_PERMISSIONS, isPermission, type Permission } from "./permissions";

export const SESSION_COOKIE = "sa_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
const RENEW_AFTER_MS = 60 * 60 * 1000; // renova quando passou 1 h

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  isAdmin: boolean;
  permissions: Set<Permission>;
  mustChangePassword: boolean;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: await clientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  // Limpeza oportunista de sessões expiradas.
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

export async function destroyUserSessions(userId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

/** Utilizador da sessão atual (memorizado por pedido). null quando não há sessão válida. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const rows = await db
    .select({
      sessionExpires: schema.sessions.expiresAt,
      user: schema.users,
      role: schema.roles,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.user.active) return null;

  // Renovação deslizante: prolonga a sessão de quem está a trabalhar.
  if (row.sessionExpires.getTime() - Date.now() < SESSION_TTL_MS - RENEW_AFTER_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, id));
    try {
      jar.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });
    } catch {
      // Em Server Components não é possível escrever cookies; a renovação fica para a próxima ação.
    }
  }

  const isAdmin = row.role.isSystem;
  const permissions = new Set<Permission>(
    isAdmin ? ALL_PERMISSIONS : (row.role.permissions ?? []).filter(isPermission),
  );
  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    roleId: row.role.id,
    roleName: row.role.name,
    isAdmin,
    permissions,
    mustChangePassword: row.user.mustChangePassword,
  };
});

export function can(user: SessionUser | null, permission: Permission): boolean {
  return Boolean(user && (user.isAdmin || user.permissions.has(permission)));
}

/** Para páginas do painel: redireciona para o login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/painel/entrar");
  return user;
}

/** Para páginas: mostra "sem acesso" em vez de dados. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect(`/painel/sem-acesso?p=${encodeURIComponent(permission)}`);
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Para Server Actions e rotas de API: lança AuthError (nunca redireciona). */
export async function assertPermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("A sua sessão terminou. Entre novamente.", 401);
  if (user.mustChangePassword) throw new AuthError("Defina uma nova palavra-passe antes de continuar.", 403);
  if (!can(user, permission)) throw new AuthError("Não tem permissão para esta ação.", 403);
  return user;
}
