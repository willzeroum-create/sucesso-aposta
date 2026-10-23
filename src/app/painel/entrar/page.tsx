import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getSiteConfig } from "@/server/settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/painel/entrar">) {
  if (await getSessionUser()) redirect("/painel");
  const { next } = await props.searchParams;
  const site = await getSiteConfig().catch(() => null);
  return (
    <main className="a-login">
      <div className="a-login-card">
        <div style={{ display: "grid", gap: 14, textAlign: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="a-login-logo" src="/brand/logo-full.png" alt={site?.name ?? "Sucesso Promissor"} width={1422} height={775} />
          <div>
            <h1>Painel do stand</h1>
            <p className="muted" style={{ fontSize: 14 }}>
              {site?.name ?? "Sucesso Promissor"}
            </p>
          </div>
        </div>
        <LoginForm next={typeof next === "string" ? next : ""} />
      </div>
    </main>
  );
}
