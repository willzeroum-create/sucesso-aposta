<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Organização deste projeto

- Nome provisório: Sucesso Aposta. O briefing original está em `codex part.txt`.
- Codex é responsável pela landing; Claude continuará backend e dashboard.
- O utilizador escolheu Editorial: `/` e `/conceito-a` usam a versão modernizada. Drive Studio permanece em `/conceito-b`. Consultar `docs/CONCEITOS.md`.
- O telemóvel é a prioridade (99% do tráfego previsto): hero com fotografia e texto na mesma composição, nunca blocos separados. Verificar 320–430 px e usar a imagem vertical própria de cada destaque.
- Antes da integração, ler `CLAUDE.md` e `docs/BACKEND_HANDOFF.md`.
- O backend e o painel (`/painel`) estão implementados pelo Claude: não editar `src/app/painel/`, `src/app/api/`, `src/app/media/`, `src/server/`, `src/db/`, `drizzle/`, `scripts/` nem `src/lib/catalog.ts`. Ver `docs/PAINEL.md`.
- Com `CATALOG_MODE=database` a landing recebe viaturas reais (imagens em `/media/...`, estados `available`/`reserved`/`sold`) e o formulário grava em `POST /api/leads`. Manter os contratos de `src/lib/contracts.ts`.
- Preservar a identidade da landing e o contrato em `src/lib/contracts.ts`.
- Mocks são demonstrativos, nunca stock de produção. Não inventar contactos ou avaliações.
- Chaves, dados administrativos e geração de imagens ficam no servidor.
- Verificar alterações com `npm.cmd run typecheck` e `npm.cmd run build` e testar os fluxos que forem afetados.
