# Editorial · Mustang · prioridade ao telemóvel

Escolha do utilizador em 15/10/2026: regressar à proposta Editorial e modernizá-la. Cerca de 99% dos acessos previstos são em telemóvel, pelo que este é o formato principal de composição e revisão.

## Entrega

- `/`: Editorial modernizado. `/conceito-a`: mesma proposta. `/conceito-b`: alternativa Drive Studio preservada.
- Hero único com fotografia ao fundo, textos e controlos sobrepostos. A imagem não se transforma num bloco separado abaixo do texto.
- Três cenários ilustrativos: Mustang Mach-E vermelho em arquitetura clara junto ao mar, Polestar 2 em arquitetura ao anoitecer e Peugeot 2008 azul numa esplanada mediterrânica.
- Cada cenário tem imagem horizontal e vertical próprias. A versão vertical é escolhida até 800 px; o texto, a altura e os controlos adaptam-se ao espaço disponível.
- Catálogo com pesquisa, categorias, orçamento, ordenação, favoritos e ficha com fotografias de referência. Créditos públicos em `/creditos`.
- Campos do formulário a 16 px no telemóvel e alvos principais com pelo menos 44 px. O estado e a validação continuam nos componentes existentes.

## Stock local editável

**Mudança durante a tarefa:** depois da importação e validação em SQLite, o backend foi alterado em paralelo para PostgreSQL/Supabase. Os seis registos, três capas e 20 ficheiros continuam preservados em `data/app.db` e `data/uploads`; a migração para o novo destino não foi executada por esta tarefa. O backend passou a incluir `scripts/sqlite-to-postgres.mts` / `npm.cmd run db:copy-local`, que deve ser revisto e executado pelo responsável da migração no destino correto. Não declarar o stock confirmado no Supabase sem verificar as linhas e os ficheiros. O preview visual final usa `CATALOG_MODE=demo` num processo separado, sem alterar as credenciais/configuração atuais.

Foram adicionados seis exemplos à base **local** já existente: Mustang vermelho, Mustang prateado, Peugeot 3008 cinzento, Peugeot 2008 azul, Nissan Qashqai branco e Polestar 2 Thunder. As oito referências enviadas representam estes seis exemplares. O Peugeot azul enviado é um **2008**, não o futuro e-208 usado como exemplo no plano de geração.

Foram importadas 20 imagens para o armazenamento existente e criadas três capas. O BMW anterior foi mantido sem alterações. O catálogo público local apresenta sete registos, incluindo esse BMW vendido. `.env.local` passou apenas de `CATALOG_MODE=demo` para `database`; as restantes definições foram preservadas. Não houve publicação num alojamento nem importação para uma base remota.

O resultado de sete registos foi verificado **antes da migração paralela do backend**. Os ficheiros de origem em `public/images` e a fixture `src/data/demo.ts` permitem apresentar a coleção independentemente do estado da ligação ao novo banco.

Preços, anos, versões, quilometragens e potência dos seis novos registos são fictícios. O destaque `Demonstração · dados fictícios` mantém os avisos na landing mesmo com a origem `database`. O proprietário deve substituir fotografias e dados e só depois remover esse destaque. Os registos não receberam matrículas, VIN, dados de clientes nem contactos inventados.

### Onde editar hoje

1. Em `/painel/viaturas`, abrir a viatura e substituir os dados e fotografias. Os IDs novos começam por `demo-`.
2. Em `/painel/site`, editar uma capa, escolher a viatura e selecionar as imagens horizontal e vertical na galeria dessa viatura. Ajustar os pontos focais, textos e cor e rever antes de publicar.
3. As composições geradas já constam das galerias do Mustang vermelho, Polestar e Peugeot 2008. Não é necessário voltar a carregá-las.

A seleção manual de capas existe. O botão dentro da ficha para gerar um novo cenário, a fila e o limite semanal **ainda não estão implementados**. O plano de integração para o Claude está em [HERO-WORKFLOW.md](HERO-WORKFLOW.md).

O contrato público só expõe a fotografia de capa de cada viatura. As vistas adicionais da demonstração usam o manifesto de referências; para uma galeria pública dinâmica de futuras viaturas, o Claude deve combinar uma extensão versionada do contrato com o frontend. Não se deve apresentar a galeria estática de demonstração depois de removido o respetivo destaque.

## Continuidade e arquivos

- Código da landing: `src/components/showroom.tsx` e `showroom-modern.css`. Não foi editado código do backend/dashboard nesta tarefa.
- Fotos pesquisadas: `docs/STOCK_PHOTO_SOURCES.md` e `src/data/photo-credits.json`. Os ficheiros de referência conservam autores e licenças.
- Composições: `public/images/hero/*architecture*`, `*blue-hour*`, `*blue-terrace*`, incluindo variantes `-mobile`. São imagens ilustrativas geradas a partir das referências enviadas, não documentação do estado real das viaturas.
- Prompts: `docs/inventory/hero-prompts.json`.
- Relatório da importação: `docs/inventory/presentation-stock-import.json`.
- Backup local da base anterior: `backups/before-presentation-stock-2026-10-15.db` (privado, ignorado pelo Git). Não deve ser publicado nem distribuído.
- Backup visual anterior: `backups/editorial-before-mustang-2026-10-15.zip`. Não restaurar o projeto inteiro por cima do backend atual.

Os formulários em modo `database` enviam ao backend existente. A identidade legal, os contactos e os textos definitivos do negócio continuam por preencher; o ambiente desta entrega é de desenvolvimento.
