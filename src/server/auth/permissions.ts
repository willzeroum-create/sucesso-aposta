/** Catálogo de permissões. Partilhável com o cliente (sem segredos). */
export const PERMISSIONS = {
  "vehicles.view": "Ver viaturas e stock",
  "vehicles.edit": "Criar e editar viaturas e fotografias",
  "vehicles.status": "Mudar estado e publicação no site",
  "vehicles.delete": "Apagar viaturas",
  "vehicles.costs": "Ver preços de compra, custos e margens",
  "billing.manage": "Gerir cobranças de vendas a prestações",
  "documents.view": "Ver documentos de viaturas e clientes",
  "documents.upload": "Carregar documentos e usar a leitura com IA",
  "customers.view": "Ver clientes",
  "customers.edit": "Criar e editar clientes",
  "forms.generate": "Gerar termos e declarações",
  "leads.view": "Ver pedidos de contacto",
  "leads.edit": "Tratar pedidos de contacto",
  "ads.view": "Ver campanhas Meta e Google Ads",
  "site.edit": "Editar dados do stand e capa do site",
  "users.manage": "Gerir utilizadores e funções",
  "audit.view": "Ver o registo de atividade",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; items: Permission[] }[] = [
  { label: "Stock", items: ["vehicles.view", "vehicles.edit", "vehicles.status", "vehicles.delete", "vehicles.costs"] },
  { label: "Cobranças", items: ["billing.manage"] },
  { label: "Documentos", items: ["documents.view", "documents.upload", "forms.generate"] },
  { label: "CRM", items: ["customers.view", "customers.edit", "leads.view", "leads.edit"] },
  { label: "Marketing e site", items: ["ads.view", "site.edit"] },
  { label: "Administração", items: ["users.manage", "audit.view"] },
];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

/** Funções iniciais. O administrador pode criar outras e ajustar estas no painel. */
export const DEFAULT_ROLES: { id: string; name: string; description: string; permissions: Permission[]; isSystem?: boolean }[] = [
  { id: "role_admin", name: "Administrador", description: "Acesso total, incluindo utilizadores e registo de atividade.", permissions: ALL_PERMISSIONS, isSystem: true },
  {
    id: "role_manager",
    name: "Gerente",
    description: "Gere stock, vendas, clientes e o site. Não gere utilizadores.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "users.manage"),
  },
  {
    id: "role_sales",
    name: "Comercial",
    description: "Atende clientes, trata pedidos, reserva viaturas e gera termos.",
    permissions: ["vehicles.view", "vehicles.status", "documents.view", "documents.upload", "customers.view", "customers.edit", "forms.generate", "leads.view", "leads.edit"],
  },
  {
    id: "role_prep",
    name: "Preparação",
    description: "Dá entrada de viaturas, fotografias e documentos.",
    permissions: ["vehicles.view", "vehicles.edit", "documents.view", "documents.upload"],
  },
  {
    id: "role_marketing",
    name: "Marketing",
    description: "Acompanha campanhas, pedidos de contacto e a capa do site.",
    permissions: ["vehicles.view", "leads.view", "ads.view", "site.edit"],
  },
];
