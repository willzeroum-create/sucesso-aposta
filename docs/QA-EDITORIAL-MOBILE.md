# Verificação da landing · 15/10/2026

## Resultado

- `npm.cmd run typecheck`: passou.
- `npm.cmd run build`: passou.
- `npm.cmd test`: 14 testes passaram.
- Revisão visual em 320, 390 e 430 px, tablet de 768 px e computador de 1440 px. Hero como composição única, com fotografia ao fundo e texto/controlos sobrepostos; carro inteiro nos enquadramentos revistos.
- Verificados: troca entre os três heroes, menu móvel, pesquisa sem resultados e reposição, filtros, ordenação por preço, favoritos, galeria, interesse com viatura pré-selecionada e validação de formulário vazio.
- Sem transbordamento horizontal nas larguras móveis verificadas. Campos móveis com texto de 16 px e alvos de toque ampliados.
- Página de créditos revista. Nenhum erro de consola registado na prévia final; aviso de desenvolvimento Next.js sobre carregamento prioritário de uma fotografia do catálogo.

## Evidência

Capturas em `docs/qa/2026-10-15/`: `mobile-320.png`, `mobile-390-mustang.png`, `mobile-390-polestar.png`, `mobile-390-peugeot.png` e `mobile-catalogue.png`.

## Limites da validação

A prévia final em `http://127.0.0.1:3102/` usa uma cópia isolada em `.tmp/mobile-preview`, com catálogo demonstrativo e sem credenciais. Durante o trabalho, o backend foi migrado em paralelo para PostgreSQL/Supabase. O stock foi preparado e importado no banco local anterior; a sua migração para o backend atual não foi executada nem validada nesta entrega. Ver `EDITORIAL-MUSTANG.md` e `inventory/presentation-stock-import.json`.

Não foram testados login do painel, persistência de lead real, geração por fornecedor ou quota operacional. Não houve publicação externa. A arquitetura de `HERO-WORKFLOW.md` é uma proposta para implementação pelo Claude. A revisão responsiva foi feita em viewports do navegador, não em aparelhos físicos ou Safari.

As alterações concorrentes do backend foram preservadas. O registo de diferenças observadas está em `inventory/protected-parallel-changes.json`.
