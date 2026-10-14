import { PasswordForm } from "@/components/painel/password-form";
import { ThemeToggle } from "@/components/painel/sidebar";
import { PERMISSIONS } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "A minha conta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="a-page" style={{ maxWidth: 860 }}>
      <div className="a-head">
        <div>
          <h1>A minha conta</h1>
          <p>
            {user.name} · {user.email} · {user.roleName}
          </p>
        </div>
      </div>
      <section className="a-card">
        <div className="a-card-head">
          <h2>Aparência</h2>
        </div>
        <div className="a-card-body" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ThemeToggle />
          <span className="muted">Alterna entre automático (segue o sistema), claro e escuro. Fica guardado neste navegador.</span>
        </div>
      </section>
      <section className="a-card">
        <div className="a-card-head">
          <h2>Palavra-passe</h2>
        </div>
        <div className="a-card-body">
          <PasswordForm />
        </div>
      </section>
      <section className="a-card">
        <div className="a-card-head">
          <h2>O que pode fazer</h2>
          <p>Definido pelo administrador na função “{user.roleName}”.</p>
        </div>
        <ul className="a-card-body" style={{ margin: 0, paddingLeft: 38, display: "grid", gap: 4 }}>
          {[...user.permissions].map((p) => (
            <li key={p}>{PERMISSIONS[p]}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
