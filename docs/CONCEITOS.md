# Direção escolhida: Editorial

**Atualização de 15/10/2026:** o utilizador preferiu a primeira proposta. A raiz `/` e `/conceito-a` mostram agora Editorial modernizado, com Mustang Mach-E vermelho e prioridade ao telemóvel. Drive Studio foi preservado em `/conceito-b`. O hero móvel é uma única composição com fotografia ao fundo, sem separar o carro abaixo do texto. Ver [EDITORIAL-MUSTANG.md](EDITORIAL-MUSTANG.md) e [HERO-WORKFLOW.md](HERO-WORKFLOW.md).

O restante documento regista a comparação histórica; as rotas da tabela abaixo correspondem ao momento anterior à escolha.

A pedido do utilizador, a segunda direção visual foi construída separadamente da primeira. A escolha final ainda está em avaliação. Ambas usam o mesmo catálogo e os mesmos contratos públicos; não é necessário um backend por proposta.

| Proposta                           | Endereço local                     | Implementação                                                     |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| 02 — Drive Studio (abertura atual) | `http://127.0.0.1:3100/`           | `src/components/drive-showroom.tsx` e `drive-showroom.module.css` |
| 01 — Editorial (preservada)        | `http://127.0.0.1:3100/conceito-a` | `src/components/showroom.tsx` e `src/app/globals.css`             |

## Direção da proposta 02

A linguagem parte de um estúdio automóvel contemporâneo: títulos condensados em grande escala, branco mineral, grafite e laranja. A tipografia principal está fora da fotografia; a imagem funciona como uma montra do automóvel, acompanhada de uma faixa com seleção e características. O catálogo usa cartões maiores, fundo escuro e especificações alinhadas.

Fontes locais: **Barlow Condensed** para títulos e **Space Grotesk Variable** para navegação, texto e dados. Cores principais: `#f0f0eb`, `#191a19` e `#ff6536`. A folha de estilos é um CSS Module isolado para preservar a aparência da proposta 01.

A composição muda também nas secções seguintes: princípios com imagem selecionável, procura personalizada em laranja e contacto com formulário enquadrado. As fotografias são reais e reutilizam o acervo licenciado já documentado em `ASSETS.md`.

## Funcionalidades adicionais

- Pesquisa combinada com categoria e orçamento máximo.
- Ordenação por preço crescente/decrescente e ano mais recente.
- Comparação de duas ou três viaturas, com tabela lateralmente navegável em ecrãs pequenos.
- Seleção de uma viatura na comparação encaminha para o formulário com o modelo associado.
- Favoritos usam a mesma chave local da primeira proposta. A comparação é temporária e não persiste dados pessoais.

O catálogo e o formulário foram revistos em modo demonstrativo. Este trabalho visual não alterou o formulário, o cliente de leads, a validação do catálogo ou os tipos partilhados. O adapter `catalog.ts` recebeu alterações do trabalho paralelo de backend, preservadas nesta entrega. Em modo remoto, a ordem dos destaques continua sob controlo do catálogo; a prioridade inicial do BMW aplica-se apenas à apresentação demonstrativa. Na proposta 02, o título principal é parte da direção visual e está fora da fotografia; imagens, enquadramentos e viatura em foco continuam ligados a `HeroSlide`.

## Preservação e regresso à primeira proposta

O backup `backups/conceito-01-editorial.zip` contém o código, assets, configuração e documentação da primeira entrega antes destas alterações, sem `node_modules`, `.next` ou credenciais reais. A rota `/conceito-a` mantém a página original disponível. Os hashes em `concept-01-preserved-hashes.json` registam o estado inicial: os componentes originais, os estilos, os tipos e o cliente de leads continuam iguais; `catalog.ts` evoluiu com o backend paralelo. Não repor o ZIP inteiro sobre trabalho posterior do Claude.

Se a escolha final for a primeira proposta, basta repor o conteúdo de `src/app/conceito-a/page.tsx` em `src/app/page.tsx`. Não é necessário apagar a segunda proposta nem mexer nos contratos. A alteração volta a usar `Showroom` como entrada principal; depois executar typecheck/build e confirmar a página.

## Continuidade com Claude

Consultar `BACKEND_HANDOFF.md`. A proposta em avaliação está na raiz `/`, mas a ligação ao catálogo, aos pedidos de contacto e aos trabalhos privados de geração é comum às duas opções. Não refazer o backend para cada visual. Preservar os dois componentes até o utilizador escolher a direção final.

Verificação desta alternativa: [QA-CONCEITO-02.md](QA-CONCEITO-02.md).
