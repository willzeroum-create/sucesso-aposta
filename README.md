# Sucesso Aposta

Primeira versão da landing page de um stand automóvel em Portugal. **Sucesso Aposta é um nome provisório**, retirado da pasta do projeto. A página pública foi preparada pelo Codex; o backend e o dashboard ficam para o Claude.

**Duas direções visuais disponíveis:** a proposta 02, Drive Studio, está em `/`; a primeira proposta editorial está preservada em `/conceito-a`. Ver [comparação e reversão](docs/CONCEITOS.md). A escolha final continua em avaliação.

Next.js **16.4.1**, React **19.3.1** e TypeScript, com App Router. Requer Node.js **20.9 ou superior**. Tipografia e fotografias são servidas localmente.

## Arranque local

Em PowerShell, na raiz do projeto:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 3100
```

Abrir [http://127.0.0.1:3100](http://127.0.0.1:3100). O modo demonstrativo funciona sem credenciais ou `.env.local`.

Scripts disponíveis:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start -- --port 3100
```

`start` requer um build prévio. `typecheck` executa `next typegen` e `tsc --noEmit`. Não existe um script de testes automatizados nesta fase.

## O que está disponível

- Landing editorial com três destaques selecionáveis manualmente, coleção pesquisável, filtros, favoritos locais e fichas de viatura.
- Formulário com validação por campo e confirmação de demonstração. Neste modo, os pedidos **não são enviados nem guardados**.
- Layout adaptado a telemóvel, fotografias por destaque e enquadramentos separados para desktop/mobile.
- Adapter de catálogo no servidor, tipos partilhados e contrato de integração preparado para o backend.

Os seis automóveis, preços e características são exemplos. As imagens são ilustrativas e não comprovam stock. Não importar estes registos para produção.

## Onde trabalhar

| Área                                               | Ficheiro                                                    |
| -------------------------------------------------- | ----------------------------------------------------------- |
| Nome provisório, catálogo e heroes de demonstração | `src/data/demo.ts`                                          |
| Tipos públicos e privados partilhados              | `src/lib/contracts.ts`                                      |
| Carregamento e validação do catálogo no servidor   | `src/lib/catalog.ts`                                        |
| Página pública e interações                        | `src/components/showroom.tsx`                               |
| Formulário e comunicação de leads                  | `src/components/inquiry-form.tsx`, `src/lib/lead-client.ts` |
| Identidade e comportamento responsivo              | `src/app/globals.css`                                       |
| Variáveis disponíveis, sem credenciais             | `.env.example`                                              |

O nome apresentado vem de `demoSiteConfig.name`; com catálogo remoto, virá de `SiteConfig.name`. O título e a descrição da página são derivados da mesma configuração em `src/app/page.tsx`. Os metadados de fallback e o `noindex` de pré-lançamento estão em `src/app/layout.tsx`.

## Painel e backend

O painel do stand está em `/painel` (viaturas, clientes, CRM, termos em PDF, anúncios, site, equipa e registo de atividade). Arranque, arquitetura, variáveis e o que foi verificado: [docs/PAINEL.md](docs/PAINEL.md).

```powershell
npm.cmd run db:migrate
npm.cmd run admin:create -- email@stand.pt "Nome Completo"
npm.cmd test
```

Para a landing usar os dados reais do painel: `CATALOG_MODE=database`.

## Continuação com Claude

Começar por [CLAUDE.md](CLAUDE.md) e pelo [contrato de backend](docs/BACKEND_HANDOFF.md). O backend, autenticação, persistência, dashboard e geração de fundos ainda não estão implementados. Estão previstos `GET /api/public/catalog` no serviço remoto e `POST /api/leads` no domínio da landing.

As variáveis de imagens estão apenas reservadas: não há chave ativa, geração automática nem consumo de API. A troca de hero usa três composições já preparadas. A edição manual e a futura geração privada devem respeitar o contrato de imagens, enquadramentos e revisão descrito no handoff.

Consultar também a [direção visual](docs/DESIGN.md) e os [créditos das fotografias](docs/ASSETS.md).

## Verificação desta entrega

Build e verificação de tipos aprovados. A revisão no navegador cobriu desktop, tablet e telemóvel, troca dos três destaques, filtros, pesquisa, favoritos, fichas e formulário demonstrativo. Não foi observado overflow horizontal nas larguras de 320, 390, 768 e 1440 px, nem erros na consola durante os fluxos revistos. Ver [registo de verificação](docs/QA.md).

Estas verificações não validam os futuros fluxos de autenticação, persistência, envio real de contactos ou geração de imagens.
