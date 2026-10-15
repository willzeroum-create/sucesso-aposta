"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { audit, diff } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";
import { isPermission } from "@/server/auth/permissions";
import { assertPermission, destroyUserSessions } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { run, UserError } from "@/server/action";

const tempPassword = () => `${randomBytes(8).toString("base64url")}7k`;

async function activeAdmins(exceptUserId?: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(and(eq(schema.users.active, true), eq(schema.roles.isSystem, true), exceptUserId ? ne(schema.users.id, exceptUserId) : undefined));
  return Number(n);
}

const userSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome.").max(120),
  email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "E-mail inválido."),
  roleId: z.string().min(1, "Escolha a função.").max(60),
});

/** Cria um utilizador com palavra-passe temporária (mostrada uma vez ao administrador). */
export async function createUser(form: FormData): Promise<ActionResult<{ password: string }>> {
  return run(async () => {
    const admin = await assertPermission("users.manage");
    const data = userSchema.parse(Object.fromEntries(form.entries()));
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, data.roleId)).limit(1);
    if (!role) throw new UserError("Função inválida.", { roleId: "Função inválida." });
    if (role.isSystem && !admin.isAdmin) throw new UserError("Só um administrador pode criar outro administrador.");
    const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, data.email)).limit(1);
    if (dup) throw new UserError("Já existe um utilizador com este e-mail.", { email: "E-mail já usado." });
    const password = tempPassword();
    const id = newId("usr");
    await db.insert(schema.users).values({ id, ...data, passwordHash: await hashPassword(password), mustChangePassword: true });
    await audit(admin, { action: "user.create", entityType: "user", entityId: id, summary: `Criou o utilizador ${data.name} (${role.name})` });
    revalidatePath("/painel/equipa");
    return { password };
  }, "Utilizador criado.");
}

export async function updateUser(id: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const admin = await assertPermission("users.manage");
    const data = userSchema.extend({ active: z.preprocess((v) => v === "on" || v === "true", z.boolean()) }).parse(Object.fromEntries(form.entries()));
    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!before) throw new UserError("Utilizador não encontrado.");
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, data.roleId)).limit(1);
    if (!role) throw new UserError("Função inválida.");
    const [beforeRole] = await db.select().from(schema.roles).where(eq(schema.roles.id, before.roleId)).limit(1);
    if ((role.isSystem || beforeRole?.isSystem) && !admin.isAdmin) throw new UserError("Só um administrador pode alterar administradores.");
    if (beforeRole?.isSystem && (!role.isSystem || !data.active) && (await activeAdmins(id)) === 0)
      throw new UserError("Tem de existir pelo menos um administrador ativo.");
    if (id === admin.id && !data.active) throw new UserError("Não pode desativar a sua própria conta.");
    const [dup] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.email, data.email), ne(schema.users.id, id))).limit(1);
    if (dup) throw new UserError("Já existe um utilizador com este e-mail.", { email: "E-mail já usado." });
    const changes = diff(before, data);
    if (!Object.keys(changes).length) return;
    await db.update(schema.users).set({ ...data, updatedAt: new Date() }).where(eq(schema.users.id, id));
    if (!data.active || before.roleId !== data.roleId) await destroyUserSessions(id);
    await audit(admin, { action: "user.update", entityType: "user", entityId: id, summary: `Editou o utilizador ${data.name}${before.roleId !== data.roleId ? ` (função: ${role.name})` : ""}${before.active !== data.active ? (data.active ? " — reativado" : " — desativado") : ""}`, changes });
    revalidatePath("/painel/equipa");
  }, "Utilizador atualizado.");
}

export async function resetUserPassword(id: string): Promise<ActionResult<{ password: string }>> {
  return run(async () => {
    const admin = await assertPermission("users.manage");
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    if (!u) throw new UserError("Utilizador não encontrado.");
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, u.roleId)).limit(1);
    if (role?.isSystem && !admin.isAdmin) throw new UserError("Só um administrador pode repor a palavra-passe de outro administrador.");
    const password = tempPassword();
    await db.update(schema.users).set({ passwordHash: await hashPassword(password), mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(schema.users.id, id));
    await destroyUserSessions(id);
    await audit(admin, { action: "user.password_reset", entityType: "user", entityId: id, summary: `Repôs a palavra-passe de ${u.name}` });
    return { password };
  }, "Palavra-passe temporária criada.");
}

const roleSchema = z.object({
  name: z.string().trim().min(2, "Indique o nome da função.").max(60),
  description: z.string().trim().max(240),
  permissions: z.array(z.string()).transform((list) => [...new Set(list.filter(isPermission))]),
});

export async function saveRole(id: string | null, input: z.input<typeof roleSchema>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const admin = await assertPermission("users.manage");
    const data = roleSchema.parse(input);
    if (id) {
      const [before] = await db.select().from(schema.roles).where(eq(schema.roles.id, id)).limit(1);
      if (!before) throw new UserError("Função não encontrada.");
      if (before.isSystem) throw new UserError("A função de administrador tem sempre acesso total e não pode ser alterada.");
      const [dup] = await db.select({ id: schema.roles.id }).from(schema.roles).where(and(eq(schema.roles.name, data.name), ne(schema.roles.id, id))).limit(1);
      if (dup) throw new UserError("Já existe uma função com esse nome.", { name: "Nome repetido." });
      const changes = diff(before, data);
      await db.update(schema.roles).set({ ...data, updatedAt: new Date() }).where(eq(schema.roles.id, id));
      await audit(admin, { action: "role.update", entityType: "role", entityId: id, summary: `Alterou as permissões da função ${data.name}`, changes });
      revalidatePath("/painel/equipa");
      return { id };
    }
    const [dup] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.name, data.name)).limit(1);
    if (dup) throw new UserError("Já existe uma função com esse nome.", { name: "Nome repetido." });
    const newRoleId = newId("role");
    await db.insert(schema.roles).values({ id: newRoleId, ...data });
    await audit(admin, { action: "role.create", entityType: "role", entityId: newRoleId, summary: `Criou a função ${data.name} (${data.permissions.length} permissões)` });
    revalidatePath("/painel/equipa");
    return { id: newRoleId };
  }, "Função guardada.");
}

export async function deleteRole(id: string): Promise<ActionResult> {
  return run(async () => {
    const admin = await assertPermission("users.manage");
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, id)).limit(1);
    if (!role) throw new UserError("Função não encontrada.");
    if (role.isSystem) throw new UserError("A função de administrador não pode ser apagada.");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(eq(schema.users.roleId, id));
    if (Number(n) > 0) throw new UserError(`Há ${n} utilizador(es) com esta função. Mude-lhes a função primeiro.`);
    await db.delete(schema.roles).where(eq(schema.roles.id, id));
    await audit(admin, { action: "role.delete", entityType: "role", entityId: id, summary: `Apagou a função ${role.name}` });
    revalidatePath("/painel/equipa");
  }, "Função apagada.");
}
