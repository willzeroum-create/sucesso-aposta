# Capas dourada e branca · 15/10/2026

Publicado em https://sucesso-aposta.vercel.app. Deploy Vercel `dpl_FzmeYnxubgxs1d4FjJETE2FLLip8`, estado `READY`.

- Polestar 2 dourado, pavilhão aberto de pedra clara. A primeira proposta de cenário escuro foi rejeitada e substituída.
- Peugeot 2008 branco pérola, jardim mediterrânico com oliveira e arquitetura clara.

Imagens produzidas com a ferramenta integrada `image_gen`. São apresentações ilustrativas. O utilizador pediu apenas as capas; os dados e fotografias comerciais das viaturas foram preservados.

## Arquivos e prompts

| Formato | Arquivo |
| --- | --- |
| Polestar computador | `public/images/hero/polestar-gold-gallery.png` |
| Polestar celular | `public/images/hero/polestar-gold-gallery-mobile.png` |
| Peugeot computador | `public/images/hero/peugeot-white-garden.png` |
| Peugeot celular | `public/images/hero/peugeot-white-garden-mobile.png` |

Dimensões: horizontal 1672×941; vertical 1086×1448. Prompts completos e referências em `inventory/polestar-gold-assets.json` e `inventory/peugeot-white-assets.json`.

As quatro imagens foram importadas pelo armazenamento existente, convertidas para WebP e anexadas às galerias. As capas `demo-hero-polestar` e `demo-hero-peugeot` foram atualizadas atomicamente, com auditoria e verificação de concorrência. Preservados Mustang, dados das viaturas, textos e posições. Ambos os novos cenários usam texto escuro. Backup e diário privado da operação em `.tmp/hero-refresh-before-2026-10-15T18-20-33-851Z.json` e `.tmp/hero-refresh-applied.json`.

## Verificação

`npm.cmd run typecheck` e `npm.cmd run build` passaram. Build remoto e publicação Vercel passaram. A duplicação de `canCosts` inicialmente encontrada no painel foi corrigida em paralelo, sem edição do painel por esta tarefa. As quatro imagens respondem HTTP 200 em produção; catálogo e HTML apontam para os novos ficheiros. Revisão visual mobile em 320/390 px e desktop 1440 px, sem alterações de layout. Capturas: `qa/2026-10-15/live-polestar-gold.png` e `live-peugeot-white.png`. Não foi realizado teste em aparelho físico.
