import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Sidebar } from "@/components/painel/sidebar";
import { PasswordForm } from "@/components/painel/password-form";
import { can, requireUser } from "@/server/auth/session";
import { getSiteConfig } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const site = await getSiteConfig();

  if (user.mustChangePassword) {
    return (
      <main className="a-login">
        <div className="a-login-card">
          <h1>Defina a sua palavra-passe</h1>
          <p className="muted">Por segurança, troque a palavra-passe temporária antes de continuar.</p>
          <PasswordForm first />
        </div>
      </main>
    );
  }

  const perms = {
    vehicles: can(user, "vehicles.view"),
    customers: can(user, "customers.view"),
    leads: can(user, "leads.view"),
    forms: can(user, "forms.generate"),
    ads: can(user, "ads.view"),
    site: can(user, "site.edit"),
    users: can(user, "users.manage"),
    audit: can(user, "audit.view"),
  };
  const newLeads = perms.leads
    ? Number((await db.select({ n: sql<number>`count(*)` }).from(schema.leads).where(eq(schema.leads.status, "new")))[0]?.n ?? 0)
    : 0;

  return (
    <div className="a-shell">
      <Sidebar perms={perms} user={{ name: user.name, role: user.roleName }} standName={site.name} newLeads={newLeads} />
      <main className="a-main" id="conteudo">
        {children}
      </main>
    </div>
  );
}
