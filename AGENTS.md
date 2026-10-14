<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Organização deste projeto

- Nome provisório: Sucesso Aposta. O briefing original está em `codex part.txt`.
- Codex é responsável pela landing; Claude continuará backend e dashboard.
- Antes da integração, ler `CLAUDE.md` e `docs/BACKEND_HANDOFF.md`.
- Preservar a identidade da landing e o contrato em `src/lib/contracts.ts`.
- Mocks são demonstrativos, nunca stock de produção. Não inventar contactos ou avaliações.
- Chaves, dados administrativos e geração de imagens ficam no servidor.
- Verificar alterações com `npm.cmd run typecheck` e `npm.cmd run build` e testar os fluxos que forem afetados.
