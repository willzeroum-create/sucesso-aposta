import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { PERMISSIONS, isPermission } from "@/server/auth/permissions";

export const metadata = { title: "Sem acesso" };

export default async function NoAccess(props: PageProps<"/painel/sem-acesso">) {
  const { p } = await props.searchParams;
  const perm = typeof p === "string" && isPermission(p) ? PERMISSIONS[p] : null;
  return (
    <main className="a-login">
      <div className="a-login-card">
        <ShieldOff size={28} aria-hidden="true" />
        <h1>Sem acesso a esta área</h1>
        <p className="muted">
          {perm ? `É necessária a permissão "${perm}". ` : ""}O administrador pode dar-lhe acesso em Equipa → Funções.
        </p>
        <Link href="/painel" className="a-btn">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
