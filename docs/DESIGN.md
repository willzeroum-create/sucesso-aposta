# Direção visual da landing

A página apresenta o stand como uma seleção editorial de automóveis: fotografia real em grande escala, títulos expressivos, informação comercial clara e espaço para explorar cada modelo. O hero responde à referência de presença e impacto fornecida no briefing, com identidade própria e mais detalhe nas restantes secções.

## Identidade

| Elemento                         | Escolha                             |
| -------------------------------- | ----------------------------------- |
| Fundo principal                  | Marfim `#f6f4ef`                    |
| Acento e ações principais        | Vinho `#661f30`                     |
| Texto e secções escuras          | `#252b27`                           |
| Texto, navegação e dados         | DM Sans Variable                    |
| Expressões editoriais em itálico | Cormorant Garamond                  |
| Fotografias                      | Ficheiros locais em `public/images` |

As fontes são distribuídas pelo projeto através de `@fontsource`; não dependem de pedidos ao Google Fonts. O vinho concentra a atenção nas ações, o marfim reduz a dureza do fundo branco e a tipografia serifada introduz contraste nos títulos sem prejudicar a leitura das especificações.

## Estrutura e utilização

A sequência é: destaque, coleção, essência, processo, procura personalizada, perguntas frequentes e contacto. Primeiro desperta interesse; depois permite comparar; por fim oferece um passo concreto para conversar sobre uma viatura ou sobre uma procura específica.

A coleção permite pesquisar marca/modelo, filtrar carroçaria e guardar favoritos no navegador. As fichas mostram preço e características de forma agrupada e associam a viatura escolhida ao formulário. A ausência de resultados tem uma ação para repor os filtros. O formulário apresenta erros por campo e distingue explicitamente a demonstração de uma aceitação real.

O conteúdo utiliza português de Portugal e valores em euros. Os contactos opcionais só aparecem quando existem dados confirmados. A versão demonstrativa identifica fotografias e dados ilustrativos, sem apresentar avaliações ou resultados comerciais inventados.

## Hero por viatura

Os três destaques atuais — Porsche, Mercedes-Benz e BMW — são escolhidos manualmente pelos controlos da capa. Cada um tem texto, fotografia, tom e enquadramento próprios em `demoHeroSlides`. A seleção muda a composição pronta; não chama uma API de imagens.

`HeroSlide` separa `imageDesktop`, `imageMobile`, `objectPositionDesktop`, `objectPositionMobile` e `textTone`. Esta estrutura deve ser mantida quando o dashboard passar a controlar a capa. A fotografia da viatura define a composição; não deformar o automóvel para preencher o espaço.

Em desktop, a imagem ampla e o gradiente sustentam a leitura do título. Em ecrãs até 600 px, a fotografia passa a ocupar uma faixa própria dentro do hero: o texto tem espaço acima e o carro conserva uma proporção legível. Uma nova fotografia exige revisão dos dois formatos, incluindo rodas, para-choques, contorno e contraste do texto.

## Responsividade e acessibilidade

A grelha passa de três para duas e depois uma coluna. Navegação, formulário, secções editoriais e fichas empilham-se conforme a largura disponível. Campos de texto no telemóvel usam tamanho legível e as ações principais têm áreas de toque generosas.

Manter o salto para conteúdo, foco visível, rótulos de controlos, estados `aria-pressed` dos filtros/favoritos, mensagens de resultado e erros associados aos campos. Os diálogos usam o elemento nativo `dialog`, fecham com Escape e devolvem o foco ao controlo anterior. Respeitar `prefers-reduced-motion` nas transições e deslocação da página.

Estes comportamentos descrevem a implementação; não substituem uma revisão visual e por teclado após mudanças. A revisão desta primeira entrega está registada em [QA.md](QA.md). Ao avançar de uma ficha para o contacto, o foco passa para o primeiro campo do formulário. Para integração e publicação, consultar [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md); para fotografias e pontos focais, consultar [ASSETS.md](ASSETS.md).
