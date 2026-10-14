import { asc, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { TeamManager } from "@/components/painel/team-manager";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Equipa" };

export default async function TeamPage() {
  const me = await requirePagePermission("users.manage");
  const users = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const roles = await db
    .select({ role: schema.roles, users: sql<number>`(select count(*) from ${schema.users} where ${schema.users.roleId} = ${schema.roles.id})` })
    .from(schema.roles)
    .orderBy(sql`${schema.roles.isSystem} desc`, asc(schema.roles.name));
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Equipa</h1>
          <p>Quem tem acesso ao painel e o que cada pessoa pode fazer.</p>
        </div>
      </div>
      <TeamManager
        meId={me.id}
        meIsAdmin={me.isAdmin}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          roleId: u.roleId,
          active: u.active,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          locked: Boolean(u.lockedUntil && u.lockedUntil.getTime() > Date.now()),
        }))}
        roles={roles.map(({ role, users: n }) => ({ id: role.id, name: role.name, description: role.description, permissions: role.permissions, isSystem: role.isSystem, users: Number(n) }))}
      />
    </div>
  );
}
