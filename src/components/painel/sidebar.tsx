"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  Activity, ArrowLeftRight, Building2, Car, FileCheck2, KeyRound, Warehouse, FileSignature, Globe, Home, LogOut, Megaphone, Menu, Moon, Settings, Stamp, Sun, SunMoon, UserRound, UsersRound, Inbox, Wallet,
} from "lucide-react";
import { logout, setTheme } from "@/app/painel/_actions/auth";

export interface NavPerms {
  vehicles: boolean;
  customers: boolean;
  leads: boolean;
  forms: boolean;
  billing: boolean;
  ads: boolean;
  site: boolean;
  users: boolean;
  audit: boolean;
}

export function Sidebar({ perms, user, standName, newLeads }: { perms: NavPerms; user: { name: string; role: string }; standName: string; newLeads: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  // `except`: subpáginas que têm o seu próprio item (ex.: Legalização › Clientes).
  const current = (href: string, except: string[] = []) =>
    (href === "/painel" ? path === href : (path === href || path.startsWith(`${href}/`)) && !except.some((e) => path.startsWith(e))) ? "page" : undefined;
  const item = (href: string, label: string, Icon: typeof Home, extra?: React.ReactNode, except?: string[]) => (
    <Link href={href} aria-current={current(href, except)}>
      <Icon size={18} aria-hidden="true" />
      {label}
      {extra}
    </Link>
  );

  return (
    <>
      <header className="a-topbar">
        <button type="button" className="a-icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} aria-controls="a-side">
          <Menu size={20} />
        </button>
        <strong style={{ fontWeight: 650 }}>{standName}</strong>
      </header>
      {open && <div className="a-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside id="a-side" className="a-side" data-open={open} aria-label="Navegação do painel">
        <Link href="/painel" className="a-brand">
          <span className="a-brand-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-emblem-160.png" alt="" width={36} height={14} />
          </span>
          <span className="a-brand-name">{standName}</span>
        </Link>
        <nav className="a-nav">
          {item("/painel", "Início", Home)}
          {(perms.vehicles || perms.customers || perms.forms || perms.billing) && <span className="a-nav-group">Stand</span>}
          {perms.vehicles && item("/painel/viaturas", "Viaturas", Car)}
          {perms.vehicles && item("/painel/estoque", "Estoque", Warehouse)}
          {perms.vehicles && item("/painel/aluguer", "Aluguer", KeyRound)}
          {perms.customers && item("/painel/clientes", "Clientes", UserRound)}
          {perms.forms && item("/painel/declaracoes", "Declarações", FileSignature)}
          {perms.forms && item("/painel/registo", "Compra e venda", ArrowLeftRight)}
          {perms.billing && item("/painel/cobrancas", "Cobranças", Wallet)}
          {perms.forms && <span className="a-nav-group">Legalização</span>}
          {perms.forms && item("/painel/legalizacao", "Carros em legalização", Stamp, null, ["/painel/legalizacao/clientes", "/painel/legalizacao/registo-inicial"])}
          {perms.forms && item("/painel/legalizacao/clientes", "Clientes da legalização", Building2)}
          {perms.forms && item("/painel/legalizacao/registo-inicial", "Registo inicial", FileCheck2)}
          {(perms.leads || perms.ads || perms.site) && <span className="a-nav-group">Vendas e marketing</span>}
          {perms.leads && item("/painel/crm", "Pedidos (CRM)", Inbox, newLeads > 0 ? <span className="a-count" aria-label={`${newLeads} novos`}>{newLeads}</span> : null)}
          {perms.ads && item("/painel/anuncios", "Anúncios", Megaphone)}
          {perms.site && item("/painel/site", "Site", Globe)}
          {(perms.users || perms.audit || perms.site) && <span className="a-nav-group">Administração</span>}
          {perms.users && item("/painel/equipa", "Equipa", UsersRound)}
          {perms.audit && item("/painel/atividade", "Atividade", Activity)}
          {perms.site && item("/painel/configuracoes", "Configurações", Settings)}
        </nav>
        <div className="a-side-foot">
          <Link href="/painel/conta" className="a-me" aria-current={current("/painel/conta")}>
            <strong>{user.name}</strong>
            <span className="muted">{user.role}</span>
          </Link>
          <div style={{ display: "flex", gap: 4 }}>
            <ThemeToggle />
            <form action={logout}>
              <button className="a-icon-btn" aria-label="Sair" title="Sair">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}

const ORDER = ["system", "light", "dark"] as const;
const THEME_LABEL = { system: "Tema: automático", light: "Tema: claro", dark: "Tema: escuro" };

export function ThemeToggle() {
  const [theme, setLocal] = useState<(typeof ORDER)[number]>("system");
  const [, start] = useTransition();
  useEffect(() => {
    const t = document.querySelector<HTMLElement>(".adm")?.dataset.theme;
    setLocal(t === "light" || t === "dark" ? t : "system");
  }, []);
  const next = () => {
    const value = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setLocal(value);
    const root = document.querySelector<HTMLElement>(".adm");
    if (root) {
      if (value === "system") delete root.dataset.theme;
      else root.dataset.theme = value;
    }
    start(() => setTheme(value));
  };
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : SunMoon;
  return (
    <button type="button" className="a-icon-btn" onClick={next} aria-label={`${THEME_LABEL[theme]}. Mudar tema`} title={THEME_LABEL[theme]}>
      <Icon size={18} />
    </button>
  );
}

