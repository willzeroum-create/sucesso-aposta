# Continuação do projeto — backend e dashboard

O nome **Sucesso Aposta** é provisório, retirado da pasta do projeto. A landing é a parte do Codex. Claude irá implementar o backend, a persistência, a autenticação, o dashboard e a geração privada dos fundos do hero.

## O que já está preparado

- `src/lib/contracts.ts`: tipos partilhados de catálogo, configuração, hero, pedidos de contacto e trabalhos de geração.
- `src/data/demo.ts`: seis viaturas ilustrativas e três composições do hero, sem telefone, email ou morada inventados.
- `src/lib/catalog.ts`: adapter exclusivamente de servidor. Carrega o modo demonstrativo por omissão e aceita um serviço HTTP real com `CATALOG_MODE=remote`.
- `.env.example`: variáveis de integração, sem credenciais. A chave de imagens ainda não está ligada a um serviço nem produz imagens.

**Os veículos, preços, anos, quilometragens, versões, potência e disponibilidade de demonstração não representam stock real.** As fotografias são referências visuais; não certificam correspondência com cada versão. Substituir tudo por registos e imagens aprovados antes de ativar o catálogo real. Não importar os mocks como stock de produção.

A landing deve manter a identificação de demonstração enquanto `source === "demo"`. O formulário nesse modo confirma uma simulação local: não grava o pedido, não envia email, não contacta ninguém e não promete retorno. Uma confirmação `accepted` só é válida depois da persistência no backend real. Não é necessário transmitir dados pessoais para validar a demonstração.

## Limites de trabalho

A lógica de backend deve respeitar o contrato público e manter o layout da landing. Não colocar autenticação, SDK de base de dados, chaves, chamadas ao gerador ou acesso administrativo em componentes do cliente. A geração de imagens pertence ao dashboard autenticado, nunca ao visitante da landing.

Os tipos de `src/lib/contracts.ts` podem ser importados no cliente; o adapter `src/lib/catalog.ts` usa `server-only` e só pode ser importado no servidor. Alterações incompatíveis no payload requerem atualização coordenada dos tipos, validação e consumidores. Não criar uma segunda fonte de configuração de nome, contactos ou hero dentro dos componentes.

## Catálogo público

Implementar `GET /api/public/catalog` no serviço de backend. O nome do endpoint é uma convenção de integração; a URL completa é configurável e não existe uma rota de backend pronta neste projeto.

```ts
// Resposta 200, Content-Type: application/json
type PublicCatalogPayload = {
  site: SiteConfig;
  vehicles: Vehicle[];
  heroSlides: HeroSlide[];
};
```

O payload não contém `source`: o adapter determina `demo` ou `remote` a partir do ambiente, sem aceitar essa informação da API. Para a estrutura integral, usar os tipos e exemplos já gravados em `src/lib/contracts.ts` e `src/data/demo.ts`.

Regras do adapter atual:

- `CATALOG_MODE` aceita apenas `demo` e `remote`; ausente significa demonstração, inclusive num build de produção. Configurar explicitamente `remote` antes de publicar stock real.
- `CATALOG_API_URL` contém o endpoint absoluto. HTTPS é obrigatório, exceto HTTP em localhost no modo de desenvolvimento. URLs com credenciais e redirecionamentos são rejeitados.
- `CATALOG_API_TOKEN`, quando preenchido, segue como Bearer apenas no pedido servidor → serviço. Não usar prefixo `NEXT_PUBLIC_`.
- Os pedidos têm timeout de 8 segundos e `cache: "no-store"`. Selecionar uma estratégia de cache e revalidação quando o backend estiver pronto; não publicar a página real como exportação estática.
- Erros HTTP, rede, timeout, JSON e schema são explícitos. **Não há fallback silencioso para os mocks em modo remoto.** A página de erro pública não deve expor tokens, stack traces ou corpos recebidos do serviço.
- IDs e slugs são únicos. Os IDs das viaturas referidas por cada hero têm de existir no payload. Existem entre 1 e 12 heroes, com no máximo 1.000 registos de veículos.
- A landing desta fase requer pelo menos uma viatura de referência para o hero. Para permitir catálogo completamente vazio, acrescentar uma composição editorial sem viatura e adaptar o contrato de forma coordenada.
- O adapter valida números, enums, contactos, caminhos/URLs de imagens e posições de enquadramento. Só aceita imagens locais iniciadas por `/` ou URLs HTTPS. Usar apenas origens de imagens aprovadas pelo negócio; se forem usadas com `next/image`, configurar também os padrões remotos de imagem.
- As posições do hero aceitam duas percentagens de 0 a 100 ou palavras CSS seguras como `center`, `right center` e `left top`.

No dashboard, editar `SiteConfig.name` para aplicar o nome definitivo. A página também usa este valor no título do navegador. Os contactos são opcionais; omitir os que ainda não existem. Telefone em formato internacional `+...`; WhatsApp apenas dígitos internacionais; email validado. Não publicar placeholders como dados do negócio.

Para fotografias de armazenamento remoto, configurar `IMAGE_REMOTE_PATTERNS` com padrões HTTPS completos separados por vírgulas, limitados ao caminho público do stand (exemplo de sintaxe: `https://cdn.example.com/stand-media/**`). Reiniciar o dev server e reconstruir a versão de produção depois de alterar. Caminhos locais `/images/...` já funcionam. Os padrões URL não permitem query strings salvo correspondência exata; preferir URLs públicas estáveis para o catálogo. Redirecionamentos de imagens estão desativados. Hero e catálogo devem receber apenas URLs de assets aprovados.

## Pedidos de contacto

Implementar **`POST /api/leads` no mesmo domínio da landing**, ou encaminhar essa rota pelo servidor para o backend escolhido. Não depender de uma URL externa exposta ao navegador com credenciais.

```json
{
  "fullName": "Nome do visitante",
  "email": "visitante@example.com",
  "phone": "+351000000000",
  "message": "Gostaria de saber mais sobre esta viatura.",
  "intent": "vehicle",
  "vehicleId": "id-publico-da-viatura",
  "consent": true
}
```

Os contactos acima são apenas sintaxe de documentação, nunca conteúdo do site. Os valores admitidos para `intent` são `vehicle`, `sourcing`, `visit` e `general`. `phone` e `vehicleId` são opcionais no tipo; quando `intent === "vehicle"`, o backend deve exigir e verificar o ID da viatura. Enquanto a seleção estiver visível no formulário, `vehicleId` também acompanha os outros motivos, incluindo `visit`. Validar qualquer ID presente e preservar a associação ao gravar o pedido. A versão publicada do formulário e o servidor devem usar os mesmos limites de texto e mensagens claras por campo.

Limites atuais do cliente, a reproduzir e reforçar no servidor: `fullName` depois de trim com 2–120 caracteres; `email` depois de trim até 254 caracteres e formato válido; `phone` opcional com até 30 caracteres, apenas `+`, algarismos, espaços, parênteses, ponto e hífen, contendo 7–15 algarismos; `message` depois de trim com 10–3.000 caracteres; `consent === true`. `vehicleId` tem de estar preenchido para o interesse numa viatura; no servidor, verificar também que corresponde a uma viatura publicada.

Resposta de sucesso após gravação, HTTP **201** (o cliente também pode aceitar outro 2xx válido):

```json
{ "status": "accepted", "leadId": "lead_123" }
```

Erro HTTP não 2xx:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Reveja os campos assinalados.",
    "fields": { "email": "Indique um email válido." }
  }
}
```

O campo `fields` é opcional e contém nomes presentes em `LeadInput`. Códigos recomendados: `VALIDATION_ERROR` (400/422), `RATE_LIMITED` (429) e `SERVICE_UNAVAILABLE` (503). Não devolver sucesso por falha de email ou persistência; separar a aceitação do pedido de futuras notificações internas. Se a gravação funcionar e uma notificação falhar, manter o lead guardado e reprocessar a notificação.

O backend deve validar todos os campos independentemente da validação do navegador, exigir `consent === true`, normalizar contactos sem perder a entrada original necessária, impedir submissões abusivas e gerir repetição de pedidos. Só habilitar o fluxo real depois de confirmar o texto e o destino da política de privacidade do negócio. Definir retenção, acesso e exportação de dados no dashboard; não gravar os dados pessoais de pedidos em logs públicos.

Não há envio real, serviço de email, base de dados ou API de leads implementados pelo adapter. A interface `DemoLeadResponse` existe exclusivamente para o preview e não é uma resposta de produção.

## Hero adaptado a cada viatura

O conteúdo público já separa imagem desktop e mobile, posições de enquadramento, tom do texto (`light`/`dark`), texto editorial e `vehicleId`. Assim o dashboard poderá selecionar a viatura e publicar uma composição preparada especificamente para essa fotografia. A troca entre os três presets da landing é uma pré-visualização de conteúdo; não implica que a imagem tenha sido gerada automaticamente.

Fluxo a implementar no dashboard:

1. Um utilizador autorizado escolhe uma viatura e envia a fotografia original. Guardar o original, a titularidade/licença, metadados e autoria. Não aceitar um URL arbitrário para download sem validação no servidor.
2. Criar um trabalho privado com `HeroGenerationRequest`; `requestedBy` deve ser preenchido a partir da sessão autenticada, nunca confiado à entrada do browser. O painel fornece o objetivo visual e referências.
3. Um worker chama o fornecedor de imagens no servidor. `OPENAI_API_KEY` está reservada para essa integração; `HERO_GENERATION_MODEL` deve ser escolhido conforme o modelo suportado na implementação. Não há um modelo presumido, uma chave preenchida nem consumo de API nesta fase.
4. Usar máscara/composição para preservar a fotografia e as características reais do automóvel: proporções, carroçaria, cor, rodas, emblemas, versão e equipamento. Gerar ou reconstruir o cenário e a área de composição em redor. Uma geração que mude o carro é rejeitada.
5. Produzir enquadramentos desktop e mobile com zona legível para texto. Validar visualmente recortes, perspetiva, sombras, reflexos e semelhança com o original. Um simples recorte pode ser suficiente; não gerar novamente sem necessidade.
6. Guardar os resultados como assets separados, com ligação ao original e ao trabalho. O estado passa para `review`, sem afetar a landing publicada.
7. Uma pessoa revê os dois formatos, define `objectPositionDesktop`, `objectPositionMobile` e `textTone`, e aprova explicitamente. Registar `reviewedBy` e `reviewedAt`.
8. Publicar uma revisão de `HeroSlide` de forma atómica. Manter a composição anterior disponível para reversão e só depois invalidar eventuais caches.

Estados: `queued → processing → review → approved`, com alternativas `failed` e `rejected`. Uma aprovação de imagem não deve publicar automaticamente uma viatura ou alterar os seus dados comerciais. Guardar custos e tentativas do trabalho no backend e aplicar limites por utilizador/negócio.

Rotas privadas sugeridas, ainda **não implementadas**: `POST /api/admin/hero-jobs`, `GET /api/admin/hero-jobs/:id`, `POST /api/admin/hero-jobs/:id/approve` e `POST /api/admin/hero-slides/:id/publish`. Autenticação, permissões, upload, proteção de origem, armazenamento e fila são responsabilidade do backend.

## Sequência de integração recomendada

1. Escolher a infraestrutura de persistência, autenticação e armazenamento; não existe fornecedor imposto pela landing.
2. Criar os modelos para configuração, viaturas, assets, heroes, leads e trabalhos privados. Separar rascunhos de conteúdo publicado.
3. Alimentar o endpoint público com um conjunto real aprovado e validar o JSON usando o contrato acima.
4. Implementar e validar `POST /api/leads` antes de mudar `CATALOG_MODE` para `remote`, porque o modo remoto ativa pedidos reais na interface.
5. Configurar contactos reais e o texto de privacidade. Verificar a exibição sem contactos opcionais.
6. Construir a gestão de viaturas e a edição manual do hero. Só depois integrar a geração assíncrona de fundos.
7. Testar sucesso e erros reais de catálogo e leads, indisponibilidade, campos inválidos e submissões repetidas. Rever desktop/mobile e o contraste de todos os heroes publicados.

Este documento é um contrato de passagem de trabalho. A execução do build da landing não valida autenticação, gravação, email, acesso ao fornecedor ou geração de imagens; esses fluxos só podem ser dados como concluídos depois da integração real.
