"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { audit } from "@/server/audit";
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { clientIp, createSession, destroySession, destroyUserSessions, getSessionUser } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { run, UserError } from "@/server/action";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function login(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const next = String(form.get("next") ?? "");
  if (!email || !password) return { ok: false, error: "Indique o e-mail (ou utilizador) e a palavra-passe." };

  const ip = (await clientIp()) ?? "local";
  const limit = await rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: `Demasiadas tentativas. Tente novamente dentro de ${Math.ceil(limit.retryAfter / 60)} minutos.` };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    await verifyPassword(password, await dummyHash()); // tempo constante
    return { ok: false, error: "Utilizador ou palavra-passe incorretos." };
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: "Conta bloqueada temporariamente por tentativas falhadas. Tente daqui a 15 minutos ou peça ao administrador." };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid || !user.active) {
    const fails = valid ? user.failedLogins : user.failedLogins + 1;
    await db
      .update(schema.users)
      .set({ failedLogins: fails >= MAX_FAILS ? 0 : fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null })
      .where(eq(schema.users.id, user.id));
    if (fails >= MAX_FAILS) await audit({ id: user.id, name: user.name }, { action: "auth.locked", entityType: "user", entityId: user.id, summary: `Conta bloqueada 15 min após ${MAX_FAILS} tentativas falhadas` });
    return { ok: false, error: user.active ? "Utilizador ou palavra-passe incorretos." : "Esta conta está desativada. Fale com o administrador." };
  }
  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await createSession(user.id);
  await audit({ id: user.id, name: user.name }, { action: "auth.login", entityType: "user", entityId: user.id, summary: "Entrou no painel" });
  redirect(user.mustChangePassword ? "/painel/conta?primeiro=1" : next.startsWith("/painel") && !next.startsWith("//") ? next : "/painel");
}

export async function logout(): Promise<void> {
  const user = await getSessionUser();
  if (user) await audit(user, { action: "auth.logout", entityType: "user", entityId: user.id, summary: "Saiu do painel" });
  await destroySession();
  redirect("/painel/entrar");
}

export async function changePassword(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await getSessionUser();
    if (!user) throw new UserError("A sessão terminou.");
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
    if (!row || !(await verifyPassword(current, row.passwordHash))) throw new UserError("A palavra-passe atual não está correta.", { current: "Incorreta." });
    const problem = passwordProblem(next);
    if (problem) throw new UserError(problem, { next: problem });
    if (next !== confirm) throw new UserError("As palavras-passe não coincidem.", { confirm: "Não coincide." });
    if (next === current) throw new UserError("Escolha uma palavra-passe diferente da atual.", { next: "Igual à atual." });
    await db.update(schema.users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, updatedAt: new Date() }).where(eq(schema.users.id, user.id));
    // Termina as outras sessões e abre uma nova neste navegador.
    await destroyUserSessions(user.id);
    await createSession(user.id);
    await audit(user, { action: "auth.password_change", entityType: "user", entityId: user.id, summary: "Alterou a palavra-passe" });
  }, "Palavra-passe alterada. As outras sessões foram terminadas.");
}

export async function setTheme(theme: "light" | "dark" | "system"): Promise<void> {
  const jar = await cookies();
  if (theme === "system") jar.delete("sa_theme");
  else jar.set("sa_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
