# Continuação do projeto

Este projeto está dividido entre **Codex: landing page** e **Claude: backend/dashboard**. A prioridade é ligar conteúdo e operações reais à interface pública existente, preservando o desenho e os contratos preparados.

O utilizador escolheu Editorial. A raiz `/` e `/conceito-a` usam `showroom.tsx`, `globals.css` e as atualizações isoladas em `showroom-modern.css`. A alternativa Drive Studio está preservada em `/conceito-b`. Ler `docs/EDITORIAL-MUSTANG.md`; os contratos e o backend são partilhados.

Antes de implementar, ler:

1. `docs/BACKEND_HANDOFF.md` — payloads, validação, leads e fluxo privado de geração de imagens.
2. `src/lib/contracts.ts` e `src/lib/catalog.ts` — tipos e adapter que a landing já utiliza.
3. `src/data/demo.ts` — exemplos de estrutura; não são dados de produção.
4. `docs/DESIGN.md` e `docs/ASSETS.md` — composição, recortes e créditos.
5. `docs/HERO-WORKFLOW.md` — preparar hero a partir da ficha da viatura, celular primeiro e máximo de duas trocas semanais por stand.

## Estado (14/10/2026)

Backend e painel implementados — ver `docs/PAINEL.md` (arquitetura, verificação e o que falta validar com credenciais reais). O catálogo tem um terceiro modo, `CATALOG_MODE=database`, que lê a base de dados do painel no mesmo domínio. `POST /api/leads` grava pedidos reais.

## Âmbito do backend

- Implementar persistência, autenticação e dashboard, escolhendo a infraestrutura adequada; não há fornecedor imposto.
- Publicar o catálogo pelo endpoint configurado em `CATALOG_API_URL` e implementar `POST /api/leads` no mesmo domínio da landing.
- Gerir configuração do stand, viaturas, fotografias, rascunhos e heroes publicados.
- Implementar a geração de fundos apenas no servidor, a partir do dashboard autenticado, com revisão antes de publicação.

O nome do stand é **Sucesso Promissor** (antes "Aposta com Sucesso Cars"; logótipo em `public/brand`). A configuração pública deve continuar a ter uma única origem: `SiteConfig`. Até à integração, os valores estão em `demoSiteConfig`. Não inventar telefone, email, morada, avaliações ou stock para preencher campos. Atualizar também os metadados SEO provisórios quando o negócio confirmar a identidade.

## Preservar a landing

Manter o layout em `src/components/showroom.tsx` e `src/app/globals.css` durante a integração. Introduzir alterações visuais apenas quando necessárias à funcionalidade acordada, verificando os três heroes e os formatos desktop/mobile.

Cada `HeroSlide` contém imagem desktop/mobile, pontos focais, tom de texto, texto editorial e ligação à viatura. Não substituir este contrato por uma imagem global ou aplicar o mesmo recorte a todos os automóveis. O utilizador rejeitou a imagem separada abaixo do texto no telemóvel: usar uma única composição, com fotografia ao fundo, texto e controlos sobrepostos. O telemóvel é o formato principal; as imagens verticais preparadas preservam o carro inteiro.

Os componentes do cliente recebem dados públicos. Chaves, SDKs de base de dados, tokens administrativos e chamadas ao gerador pertencem ao servidor. `src/lib/catalog.ts` já usa `server-only`; os tipos de `src/lib/contracts.ts` podem ser partilhados. Nunca colocar segredos em variáveis `NEXT_PUBLIC_`.

O modo `demo` é a opção predefinida e mantém avisos visíveis. Não copiar mocks para produção nem devolver confirmação de contacto real sem gravação. Em modo remoto, o adapter não deve esconder falhas com um fallback para demonstração. Implementar e verificar leads antes de ativar `CATALOG_MODE=remote`.

## Ambiente e verificação

Node.js 20.9+, Next.js 16.4.1, React 19.3.1 e TypeScript. Instalar com `npm.cmd ci`. Iniciar com `npm.cmd run dev -- --port 3100`.

Após alterações, executar `npm.cmd run typecheck` e `npm.cmd run build`. Validar também os fluxos reais que forem implementados: catálogo, formulário, permissões e persistência. O build inicial passou, mas não constitui validação do backend. Não declarar QA de browser ou de fornecedor sem a executar.

Usar `.env.example` como referência. `OPENAI_API_KEY` e `HERO_GENERATION_MODEL` estão reservados e vazios; ainda não existe integração ativa de geração. Guardar credenciais reais apenas no ambiente local ou no serviço de alojamento, fora do repositório.
