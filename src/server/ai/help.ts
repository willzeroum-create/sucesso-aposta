/**
 * Ajuda do painel: a mesma IA da leitura de documentos responde a dúvidas sobre ONDE fazer cada coisa.
 * Só conhece o guia (help-guide.ts) e o menu que este utilizador vê; não tem acesso aos dados nem executa ações.
 */
import "server-only";
import type { SessionUser } from "@/server/auth/session";
import { can } from "@/server/auth/session";
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { AiError, requestJson } from "./provider";
import { HELP_GUIDE } from "./help-guide";

export interface HelpMessage {
  role: "user" | "assistant";
  text: string;
}

export interface HelpLink {
  href: string;
  label: string;
}

/** Páginas para onde a ajuda pode mandar a pessoa (com o grupo do menu e a permissão de que precisa). */
const PAGES: { href: string; label: string; menu: string; permission: Permission | null }[] = [
  { href: "/painel", label: "Início", menu: "Início", permission: null },
  { href: "/painel/viaturas", label: "Viaturas", menu: "Stand › Viaturas", permission: "vehicles.view" },
  { href: "/painel/viaturas/nova", label: "Dar entrada de carro", menu: "Stand › Viaturas › botão de dar entrada", permission: "vehicles.edit" },
  { href: "/painel/estoque", label: "Estoque", menu: "Stand › Estoque", permission: "vehicles.view" },
  { href: "/painel/aluguer", label: "Aluguer", menu: "Stand › Aluguer", permission: "vehicles.view" },
  { href: "/painel/clientes", label: "Clientes", menu: "Stand › Clientes", permission: "customers.view" },
  { href: "/painel/clientes/novo", label: "Gerar ficha de cliente", menu: "Stand › Clientes › botão Gerar ficha de cliente", permission: "customers.edit" },
  { href: "/painel/declaracoes", label: "Declarações", menu: "Stand › Declarações", permission: "forms.generate" },
  { href: "/painel/registo", label: "Compra e venda", menu: "Stand › Compra e venda", permission: "forms.generate" },
  { href: "/painel/cobrancas", label: "Cobranças", menu: "Stand › Cobranças", permission: "billing.manage" },
  { href: "/painel/cobrancas/nova", label: "Nova cobrança", menu: "Stand › Cobranças › nova", permission: "billing.manage" },
  { href: "/painel/legalizacao", label: "Carros em legalização", menu: "Legalização › Carros em legalização", permission: "forms.generate" },
  { href: "/painel/legalizacao/clientes", label: "Clientes da legalização", menu: "Legalização › Clientes da legalização", permission: "forms.generate" },
  { href: "/painel/legalizacao/registo-inicial", label: "Registo inicial", menu: "Legalização › Registo inicial", permission: "forms.generate" },
  { href: "/painel/crm", label: "Pedidos (CRM)", menu: "Vendas e marketing › Pedidos (CRM)", permission: "leads.view" },
  { href: "/painel/anuncios", label: "Anúncios", menu: "Vendas e marketing › Anúncios", permission: "ads.view" },
  { href: "/painel/site", label: "Site", menu: "Vendas e marketing › Site", permission: "site.edit" },
  { href: "/painel/equipa", label: "Equipa", menu: "Administração › Equipa", permission: "users.manage" },
  { href: "/painel/atividade", label: "Atividade", menu: "Administração › Atividade", permission: "audit.view" },
  { href: "/painel/configuracoes", label: "Configurações", menu: "Administração › Configurações", permission: "site.edit" },
  { href: "/painel/conta", label: "A minha conta", menu: "o seu nome, no fundo do menu", permission: null },
];

/** Onde a pessoa está agora, em palavras (para respostas como "nesta página, carregue em…"). */
function describePath(path: string): string {
  if (/^\/painel\/(viaturas|estoque)\/(?!nova)[^/]+/.test(path)) return "a ficha de um carro";
  if (/^\/painel\/clientes\/(?!novo)[^/]+/.test(path)) return "a ficha de um cliente";
  if (/^\/painel\/legalizacao\/clientes\/[^/]+/.test(path)) return "a ficha de um cliente da legalização";
  if (/^\/painel\/legalizacao\/(?!clientes|registo-inicial)[^/]+/.test(path)) return "o processo de legalização de um carro";
  if (/^\/painel\/registo\/[^/]+/.test(path)) return "uma compra e venda";
  if (/^\/painel\/cobrancas\/(?!nova)[^/]+/.test(path)) return "uma cobrança (venda a prestações)";
  if (/^\/painel\/crm\/[^/]+/.test(path)) return "um pedido de contacto";
  const page = [...PAGES].sort((a, b) => b.href.length - a.href.length).find((p) => path === p.href || path.startsWith(`${p.href}/`));
  return page ? `a página "${page.label}"` : "o painel";
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "links"],
  properties: {
    answer: { type: "string", description: "Resposta para mostrar à pessoa." },
    links: { type: "array", items: { type: "string" }, description: "Até 3 endereços da lista de páginas, para abrir com um toque." },
  },
};

export async function answerHelp(
  user: SessionUser,
  input: { messages: HelpMessage[]; path: string; mobile: boolean; standName: string },
): Promise<{ answer: string; links: HelpLink[] }> {
  const allowed = PAGES.filter((p) => !p.permission || can(user, p.permission));
  const blocked = PAGES.filter((p) => p.permission && !can(user, p.permission));

  const system = `És o assistente de ajuda do painel de gestão do stand ${input.standName}. A tua única função é explicar como usar este painel: onde clicar, que página abrir e que passos seguir. Não tens acesso aos dados (carros, clientes, valores) e não fazes ações — só guias.

REGRAS
- Responde em português, simples e curto (no máximo ~120 palavras), como um colega sentado ao lado. Trata a pessoa por "você".
- Usa os nomes EXATOS dos menus, separadores e botões, a negrito com **assim**.
- Quando houver mais de um passo, usa uma lista numerada (1., 2., 3.).
- Baseia-te APENAS no guia abaixo. Se o guia não cobrir a pergunta, diz que não tens a certeza e indica a página mais provável. Nunca inventes botões, campos ou páginas.
- Onde fica o menu: ${
    input.mobile
      ? 'a pessoa está no TELEMÓVEL: o menu abre no botão com três riscos (☰), no canto superior esquerdo, ao lado do nome do stand.'
      : "a pessoa está no COMPUTADOR: o menu está sempre visível na coluna da esquerda."
  }
- Só indiques páginas, separadores e botões que esta pessoa consegue usar (ver as listas abaixo; no guia, a permissão necessária está entre parênteses retos). Se precisar de algo sem acesso, diz que tem de pedir ao administrador para lhe dar essa permissão na função dela (Equipa). Nunca mostres os códigos das permissões (ex.: vehicles.edit): usa a descrição.
- Não inventes números, estados nem prazos de carros ou clientes concretos: explica onde se veem.
- Se a pergunta não tiver nada a ver com o painel ou com o trabalho do stand, responde numa frase que só ajudas com o painel.
- Em "links" devolve até 3 endereços (só endereços exatos da lista "Páginas que pode abrir") que levem direto ao sítio certo; lista vazia se nenhum ajudar.

QUEM PERGUNTA
${user.name} — função "${user.roleName}". Está agora em ${describePath(input.path)} (${input.path}).
Permissões: ${user.isAdmin ? "todas (administrador)." : ALL_PERMISSIONS.filter((p) => can(user, p)).map((p) => `${p} (${PERMISSIONS[p]})`).join("; ") || "nenhuma."}

PÁGINAS QUE PODE ABRIR (endereço — onde está no menu)
${allowed.map((p) => `${p.href} — ${p.menu}`).join("\n")}
${blocked.length ? `\nPÁGINAS SEM ACESSO PARA ESTA PESSOA\n${blocked.map((p) => p.menu).join("\n")}\n` : ""}
GUIA DO PAINEL
${HELP_GUIDE}`;

  const history = input.messages.slice(-10);
  const last = history.at(-1);
  if (!last || last.role !== "user") throw new AiError("Escreva a sua pergunta.", 400);
  const before = history.slice(0, -1);
  const text = `${before.length ? `Conversa até agora:\n${before.map((m) => `${m.role === "user" ? "Pessoa" : "Ajuda"}: ${m.text}`).join("\n")}\n\n` : ""}Pergunta: ${last.text}`;

  let json: Record<string, unknown>;
  try {
    json = await requestJson({ system, parts: [{ text }], schema: SCHEMA, fidelity: false });
  } catch (e) {
    if (e instanceof AiError && e.status === 422) throw new AiError("A ajuda não conseguiu responder. Tente escrever a pergunta de outra forma.", 422);
    throw e;
  }
  const answer = typeof json.answer === "string" ? json.answer.trim().slice(0, 3000) : "";
  if (!answer) throw new AiError("A ajuda não conseguiu responder. Tente escrever a pergunta de outra forma.", 422);
  const hrefs = Array.isArray(json.links) ? json.links.filter((l): l is string => typeof l === "string") : [];
  const links: HelpLink[] = [];
  for (const href of hrefs) {
    const page = allowed.find((p) => p.href === href.trim());
    if (page && !links.some((l) => l.href === page.href)) links.push({ href: page.href, label: page.label });
    if (links.length === 3) break;
  }
  return { answer, links };
}
