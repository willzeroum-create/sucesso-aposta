# Painel do stand e backend

Backend e dashboard do Sucesso Aposta, no mesmo projeto Next.js da landing. O painel está em `/painel` e a landing pública não muda de aspeto: só passa a receber dados reais.

## Arranque local

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run admin:create -- email@stand.pt "Nome Completo"
npm.cmd run dev -- --port 3100
```

- `npm.cmd run dev` aplica as migrações antes de arrancar.
- `admin:create` mostra uma palavra-passe temporária, que tem de ser trocada no primeiro acesso. Se o e-mail já existir, repõe o acesso.
- O painel abre em `http://127.0.0.1:3100/painel`.

Verificações:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Arquitetura

| Camada | Escolha | Onde |
| --- | --- | --- |
| Base de dados | SQLite/libSQL com Drizzle. Em local é o ficheiro `data/app.db`; em produção é o Turso. | `src/db/schema.ts`, `drizzle/` |
| Sessões | Cookie `httpOnly` com um token aleatório; a base de dados guarda só o hash SHA-256. Duram 12 h e renovam-se com o uso. | `src/server/auth/session.ts` |
| Palavras-passe | scrypt; bloqueio de 15 min após 5 falhas; limite de tentativas por IP. | `src/server/auth/password.ts`, `_actions/auth.ts` |
| Permissões | 16 permissões e funções editáveis. O Administrador tem sempre acesso total. | `src/server/auth/permissions.ts` |
| Registo de atividade | Todas as ações (quem, quando, o quê, alterações campo a campo). Os dados pessoais aparecem só como "alterado". | `src/server/audit.ts`, `/painel/atividade` |
| Ficheiros | Disco local (`data/uploads`) ou Vercel Blob privado. Fotografias convertidas para WebP sem EXIF/GPS. O tipo é validado pela assinatura real do ficheiro. | `src/server/storage.ts` |
| Leitura com IA | Gemini ou Claude, com a mesma camada do LegalCar. O resultado é sempre uma proposta para rever. | `src/server/ai/` |
| Pesquisa por VIN | NHTSA vPIC (gratuito) e RDW por matrícula holandesa (gratuito); vindecoder.eu opcional e pago. | `src/server/vin.ts` |
| Termos em PDF | Modelos com campos `{{...}}`, editáveis no painel e gerados com pdf-lib. | `src/lib/form-templates.ts`, `src/server/forms.ts` |
| Anúncios | Meta Marketing API e Google Ads API (REST), só leitura, com cache de 10 min. | `src/server/ads.ts` |

As mutações do painel são Server Actions (`src/app/painel/_actions/`) e verificam a permissão no servidor em cada chamada. Os uploads usam rotas próprias (`/api/admin/...`), que aceitam apenas pedidos da mesma origem.

## O que o painel faz

- **Viaturas**
  - Estados Em preparação, Disponível, Reservado e Vendido.
  - Publicação no site com um clique. Uma viatura só é publicada se tiver todos os campos do contrato `Vehicle` e uma fotografia.
  - Galeria com ordenação e fotografia de capa, documentos privados, termos e histórico.
  - Custos e margem, visíveis só com a permissão `vehicles.costs`.
- **Entrada de viatura**
  - Fotografar o DUA, livrete estrangeiro, CoC ou fatura: a IA propõe os campos, a pessoa confirma e os documentos ficam anexados.
  - Ou escrever só o VIN e carregar em pesquisar.
- **Clientes**
  - Ficha preenchida a partir do Cartão de Cidadão, título de residência, passaporte ou comprovativo de morada.
  - Validação do NIF por dígito de controlo e aviso de documento caducado.
  - Apagamento da ficha, ao abrigo do RGPD.
- **Venda (na página da viatura)**
  - Escolher um cliente existente ou criar um novo, incluindo a leitura do documento por IA.
  - Indicar preço, data, hora, km e observações.
  - Um clique marca a viatura como vendida e gera o contrato e o termo de entrega já preenchidos.
- **Documentos Word do stand**
  - Em Configurações → Modelos de documentos carrega-se o contrato e o termo reais (.docx), com campos `{{cliente.nome}}`, `{{viatura.vin}}`, etc.
  - Cada venda gera uma cópia em Word preenchida, mantendo o formato do original.
  - Exemplos para teste em `docs/modelos/`. Sem documento Word, é usado o texto-base em PDF.
- **Termos e fichas**
  - Termo de entrega e responsabilidade, contrato de compra e venda, declaração de venda ao stand, ficha de cliente e folha de dados para o Requerimento de Registo Automóvel.
  - O stand pode colar o texto que já usa em Configurações → Modelos de documentos.
- **CRM**
  - Pedidos do formulário do site e registados à mão (telefone, presencial…).
  - Fases, responsável, notas, conversão em ficha de cliente, e botões para ligar, WhatsApp e e-mail.
- **Anúncios:** investimento, cliques, CPC e conversões por campanha (Meta e Google), e pedidos por origem (UTM).
- **Site:** nome e contactos (`SiteConfig`) e capas do hero com enquadramento desktop/mobile e pré-visualização. Cada capa começa como rascunho e é publicada depois.
- **Equipa:** utilizadores com palavra-passe temporária, ativar/desativar, repor palavra-passe, e funções com permissões por caixa de seleção.
- **Tema** claro, escuro ou automático, guardado por navegador.

## Ligar a landing ao painel

1. Publicar pelo menos uma viatura completa no painel.
2. Preencher em Configurações a política de privacidade e o texto do consentimento.
3. Definir `CATALOG_MODE=database` e reiniciar.

Neste modo:

- O adapter (`src/lib/catalog.ts`) lê a base de dados diretamente e aplica a mesma validação `parsePublicCatalog`, sem recorrer aos dados de demonstração.
- O formulário passa a enviar para `POST /api/leads`, que valida com as mesmas regras do cliente e confirma que a viatura está publicada.
  - Rejeita outras origens e aplica um limite de 5 pedidos por IP em 10 minutos.
  - Pedidos repetidos dentro de 10 minutos devolvem o mesmo `leadId` em vez de criar outro.
  - Guarda o texto do consentimento com cada pedido.
- `GET /api/public/catalog` publica o mesmo payload para consumidores externos, protegido por `CATALOG_API_TOKEN` se estiver definido.
- Sem nenhuma capa publicada, o site usa uma capa automática com a primeira viatura disponível.
- As viaturas vendidas continuam visíveis 30 dias com a indicação "Vendido".

## Produção

- **Vercel:** são obrigatórios `DATABASE_URL` + `DATABASE_AUTH_TOKEN` (Turso) e `STORAGE_DRIVER=blob` + `BLOB_READ_WRITE_TOKEN`, porque o disco da Vercel não persiste. Comando de build: `npm run db:migrate && npm run build`.
- **Servidor próprio (VPS):** pode manter o SQLite e o disco locais. Faça cópia de segurança da pasta `data/`.
- **Limite de upload na Vercel:** 4,5 MB por pedido. O painel reduz as fotografias no navegador e envia um ficheiro de cada vez, mas PDFs maiores do que esse limite falham na Vercel.

Todas as variáveis estão em `.env.example`. Nenhuma usa `NEXT_PUBLIC_`.

## Verificado nesta entrega

- `typecheck`, `build` e 13 testes automáticos (`npm.cmd test`): validações, regras dos pedidos, normalização da IA, permissões, palavras-passe, deteção de tipo de ficheiro e geração do PDF do termo.
- No navegador:
  - login e troca obrigatória da palavra-passe;
  - pesquisa por VIN, com preenchimento de 10 campos;
  - criação da viatura;
  - upload de fotografias, incluindo a recusa de um ficheiro falso;
  - publicação, catálogo validado pelo adapter e landing em modo `database` a mostrar a viatura;
  - formulário real da landing → CRM → ficha de cliente;
  - termo gerado em PDF;
  - todas as páginas do painel sem erros e sem transbordo horizontal a 375 px.
- API de pedidos: 201, 422 por campo, repetição idempotente, viatura inexistente e origem estrangeira (403).

## Ainda não verificado

- **Leitura com IA:** depende de uma chave `GEMINI_API_KEY` ou `ANTHROPIC_API_KEY` neste projeto. Foi testada só a normalização das respostas, não uma chamada real.
- **Meta Ads e Google Ads:** sem credenciais. O código segue as APIs oficiais (Graph API, Google Ads REST v25), mas não foi exercitado.
- **vindecoder.eu:** sem conta; o cálculo da assinatura segue a documentação pública e deve ser confirmado na primeira utilização.
- **Turso e Vercel Blob:** só foi testado o modo local.
- **Geração automática de fundos do hero:** continua reservada, sem integração. As capas usam fotografias reais com enquadramento manual.
- **Textos dos termos:** são uma proposta e devem ser revistos por um jurista ou contabilista do stand.
