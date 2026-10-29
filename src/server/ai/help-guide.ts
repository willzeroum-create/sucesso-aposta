/**
 * Guia do painel para a ajuda com IA (botão flutuante). Textos dos botões copiados do ecrã.
 * Ao mudar um botão, menu ou página do painel, atualizar aqui também.
 * Entre parênteses retos está a permissão necessária (não mostrar os códigos à pessoa).
 */
export const HELP_GUIDE = String.raw`
## Estrutura geral
- Entrar: página "Painel do stand", campos "E-mail ou utilizador" e "Palavra-passe", botão "Entrar". No primeiro acesso (ou depois de o administrador repor a palavra-passe) aparece "Defina a sua palavra-passe": "Palavra-passe temporária", "Nova palavra-passe" (mínimo 10 caracteres, com letras e algarismos), "Repetir a nova palavra-passe", botão "Guardar palavra-passe".
- Menu no COMPUTADOR: sempre visível na coluna da esquerda. Menu no TELEMÓVEL: escondido; abre no botão de três riscos (☰) no canto superior esquerdo, ao lado do nome do stand; fecha ao tocar fora ou ao abrir uma página.
- Itens do menu: "Início"; grupo Stand: "Viaturas", "Estoque", "Aluguer" [vehicles.view], "Clientes" [customers.view], "Declarações", "Compra e venda" [forms.generate], "Cobranças" [billing.manage]; grupo Legalização [forms.generate]: "Carros em legalização", "Clientes da legalização", "Registo inicial"; grupo Vendas e marketing: "Pedidos (CRM)" [leads.view] (mostra o número de pedidos novos), "Anúncios" [ads.view], "Site" [site.edit]; grupo Administração: "Equipa" [users.manage], "Atividade" [audit.view], "Configurações" [site.edit].
- Fundo do menu: o nome da pessoa e a função (abre "A minha conta"); botão só com ícone de sol/lua para o tema (automático → claro → escuro); botão só com ícone de porta com seta para "Sair".
- Sem permissão aparece "Sem acesso a esta área" com "Voltar ao início".
- Este botão redondo de ajuda fica no canto inferior direito de todas as páginas do painel.

## Páginas

### Início (/painel)
Título "Olá, [nome]": resumo do stand. Botão "Dar entrada de viatura" [vehicles.edit]. Cartões clicáveis: "No site" (Viaturas › Disponível), "Estoque", "Alugados agora" (Aluguer), "Vendidas este mês" (Viaturas › Vendido). Avisos quando se aplicam: "Cobranças em atraso", DAV perto do prazo. Secções: "Pedidos por responder" (botão "Abrir CRM"), "Em preparação", "Inspeções a vencer", "Contactos".

### Viaturas (/painel/viaturas)
Só os carros com destino Venda (os do site). Botões "Dar entrada de viatura" [vehicles.edit] e "Atualizar da Tampinha Cars" [vehicles.status] (copia preços, fotos e descrições do site do parceiro). Separadores de estado: "Em stock", "Em preparação", "Disponível", "Reservado", "Vendido". Pesquisa por marca, modelo, matrícula ou VIN. Cada cartão abre a ficha do carro.

### Estoque (/painel/estoque)
Todos os carros da casa (venda, aluguer e só estoque) e os custos de cada um. Botão "Dar entrada de carro" [vehicles.edit]. Totais "Carros em estoque" e, com [vehicles.costs], "Total investido", "Custos registados", "Sem preço de compra". Filtros: "Todos", "Venda", "Aluguer", "Só estoque", "Em legalização", "Vendidos". Pesquisa por marca, modelo, matrícula ou VIN.

### Dar entrada de carro (/painel/viaturas/nova) [vehicles.edit]
Chega-se pelos botões "Dar entrada de viatura" (Início e Viaturas), "Dar entrada de carro" (Estoque) ou "Adicionar carro à frota" (Aluguer).
- Caixa "Preencher a partir de documentos": "Fotografar" / "Escolher ficheiros" (DUA, livrete), depois "Ler N documentos"; "Limpar"; no resumo "Usar o do documento", "Fechar resumo", "Tentar de novo" se falhar.
- Caixa "Fotografias da viatura": "Escolher fotografias" (no telemóvel "Tirar ou escolher fotografias"), "Enviar do telemóvel (QR)" (só no computador), "Identificar o carro pela foto". A primeira foto fica como "Capa".
- "Para onde vai este carro?": "Venda" (vai para o site), "Aluguer" (frota de aluguer), "Só estoque" (não vai para o site).
- Caixa "Carro importado — começar a legalização" [forms.generate].
- Campos: identificação (o VIN tem botão de lupa para pesquisar características; "Importada dos Países Baixos? Preencher pela matrícula holandesa (RDW)" com "Pesquisar"), características, "Preço e descrição" ("Sob consulta", "Por encomenda"), registo e dados técnicos, "Interno" (preço de compra só com [vehicles.costs], notas internas).
- Botão final "Criar viatura". O carro fica "Em preparação" (fora do site) até estar pronto.

### Ficha do carro (/painel/viaturas/ID ou /painel/estoque/ID — abre-se ao tocar num carro em Viaturas ou Estoque)
- Cabeçalho com marca e modelo; link "Ver no site" quando publicado.
- Percurso do carro (clicável): "1 · Entrada", "2 · Preparação", "3 · Legalização" (botão "Começar legalização"), "4 · Destino".
- Estado [vehicles.status]: "Em preparação", "Disponível", "Reservado" (diálogo "Reservar viatura" → "Confirmar reserva"), "Vendido" (diálogo "Marcar como vendida" → "Confirmar venda").
- Publicação (só carros de Venda): "Publicar no site" / "Retirar do site". Se faltar algo aparece "Para publicar falta: …" (marca, modelo, versão, ano, km, combustível, caixa, preço, fotografia de capa).
- "Destino do carro" [vehicles.status]: "Venda", "Aluguer", "Só estoque". Sair de Venda tira o carro do site.
- "Excluir carro" [vehicles.delete] → "Excluir definitivamente".
- Separadores: "Dados" (formulário com "Guardar alterações" e "Desfazer"; editar exige [vehicles.edit]), "Venda" [forms.generate], "Aluguer" [forms.generate + vehicles.status], "Custos" [vehicles.costs], "Fotografias", "Documentos" [documents.view], "Termos" [forms.generate], "Histórico".
- Separador "Venda": no topo, "Documentos desta venda" (todos os documentos gerados para o carro, com "Abrir PDF"); depois a mesma Compra e venda da página "Compra e venda", ligada a este carro (botão "Começar a compra e venda" na primeira vez; "Abrir em página própria"): documentos com IA, comprador, vendedor, fiador, requerimento do IRN, "6. Pagamento" e "7. Declarações e documentos" (garantia, circulação, consignação, dados para o requerimento, venda ao stand; "Marcar a viatura como vendida"). Por baixo, cartão "Venda a prestações" com "Nova venda a prestações" [billing.manage].
- Separador "Aluguer": igual, com "1. Locatário" e "2. Dados do aluguer"; botão final "Registar aluguer e gerar contrato"; lista "Alugueres desta viatura".
- Separador "Custos": "Preço de compra" + "Guardar"; caixa "Anotações" para coisas avulsas (ex.: um custo que talvez entre) + "Guardar anotações"; "Custos adicionais" (descrição, valor, botão "+"); total "O carro está a sair por".
- Separador "Fotografias": "Fotografar com o telemóvel" (no computador, mostra um QR válido 15 minutos); zona "Toque para fotografar ou escolher fotografias" (no computador também se pode arrastar); em cada foto setas para mudar a ordem, estrela "Usar como capa", lixo "Apagar fotografia".
- Separador "Documentos": no topo, "Documentos gerados (garantia, declarações, contratos)" com "Abrir PDF"; escolher o tipo e "Fotografar" ou "Carregar"; em cada documento mudar o tipo, "Validade", abrir, descarregar, apagar. Se houver legalização aparece "Documentos da legalização" com "Abrir legalização".
- Separador "Termos": "Gerar termo ou ficha" (escolher o "Documento"), "Verificar dados", "Gerar PDF"; lista "Documentos gerados" com "Abrir".
- Separador "Histórico": registo das alterações do carro.

### Aluguer (/painel/aluguer)
Quem tem cada carro alugado e até quando. Botão "Adicionar carro à frota". Secções: "Alugados agora" (botões "Registar devolução", "Prolongar", "WhatsApp", "Cancelar"), "Frota de aluguer" (cada carro livre tem "Alugar" [forms.generate + vehicles.status]), "Histórico de alugueres" (pesquisa e "Apagar do histórico").

### Clientes (/painel/clientes) [customers.view]
Botão "Gerar ficha de cliente" [customers.edit] e pesquisa por nome, NIF, e-mail ou telefone. Nova ficha (/painel/clientes/novo): caixa de IA para ler o documento de identificação, campos de identificação, contactos e notas, botão "Criar ficha de cliente". Ficha do cliente: separadores "Ficha", "Documentos", "Termos", "Histórico"; botão "Guardar alterações"; secção "Apagar ficha".

### Declarações (/painel/declaracoes) [forms.generate]
Para fazer qualquer documento à parte, sem carro registado ou sem passar pela venda. "Que documento quer fazer?": "Declaração de circulação", "Contrato de consignação", "Termo de garantia", "Dados para o Requerimento de Registo Automóvel", "Declaração de venda de viatura ao stand", "Contrato de locação", "Ficha de cliente"; atalhos para "Requerimento de Registo Automóvel" e "Legalização (Modelo 9, DAV, registo inicial)"; com [billing.manage] também o cartão "Contrato de pagamento a prestações" (escolher a "Venda a prestações" → "Abrir o contrato", que abre o contrato de assunção na ficha da cobrança; ou "Nova venda a prestações"). Depois de escolher: "Limpar dados", "Outro documento", caixa "Fotografias dos documentos" (fotografar, ler com IA ou QR do telemóvel), "Procurar cliente registado (opcional)", "Procurar viatura registada (opcional)" ("Desligar" para desfazer), "Rever dados do documento" → "Gerar documento" → "Abrir (PDF)" → "Fazer outra".

### Compra e venda (/painel/registo) [forms.generate]
Prepara o Requerimento de Registo Automóvel do IRN. Campo "Viatura do stock (opcional)" e botão "Nova compra e venda". No processo (grava sozinho): "1. Documentos das pessoas e do carro" (caixa de IA; o DUA/Certificado de Matrícula preenche a viatura; pergunta "Quem é o comprador?" e "Algum é o fiador?", ou os botões "Comprador"/"Vendedor"/"Fiador"), "2. Comprador" e "3. Vendedor" (botões com as empresas, "Ou um cliente da lista", "Particular"/"Empresa"; entre os dois "Trocar comprador e vendedor"), cartão "Fiador / 2.º titular" (aparece quando se escolhe um fiador, ou no botão "Fiador / 2.º titular (opcional, só para as Cobranças)"; "Tirar"), "4. Viatura e data", "5. Requerimento de registo" ("Gerar requerimento (PDF)" ou "Gerar com o que há (PDF)" / "Gerar de novo", "Abrir requerimento", "Estado"; o 2.º titular / fiador não entra no requerimento do IRN, só nos documentos internos das Cobranças), "6. Pagamento" (valor da venda, entrada, banco; "Ficou algum valor por pagar?" → "Como vai ser pago?" "À vista" (data) ou "Em prestações" → "Passar para as Cobranças?" → botão "Abrir nas Cobranças", que abre a nova venda a prestações já preenchida, já com o fiador, se houver; "Como ficou combinado" para anotações), "7. Declarações e documentos" (as caixas "Termo de garantia", "Declaração de circulação", "Contrato de consignação", "Dados para o Requerimento de Registo Automóvel", "Declaração de venda de viatura ao stand"; preço, km e meses de garantia; "Marcar a viatura como vendida" quando é um carro do stock; "Rever dados dos documentos" → "Dados dos documentos" → "Gerar documentos"; lista dos gerados com "Abrir"); "Apagar". A mesma Compra e venda aparece no separador "Venda" da ficha de cada carro.

### Cobranças (/painel/cobrancas) [billing.manage]
Vendas a prestações. Botão "Nova venda a prestações". Listas "Em atraso", "Vence hoje", "Próximos 7 dias" com "Recebido" (abre "Registar recebimento" → "Confirmar"), "WhatsApp", "Desfazer"; lista "Todas as vendas a prestações" com pesquisa. Nova venda (/painel/cobrancas/nova): "1. Cliente" ("Da lista"/"Novo"; botão "Segundo titular / fiador (opcional)"), "2. Viatura", "3. Valores e prestações" (venda, entrada, "Pago pelo banco / financeira", dívida, "De quanto em quanto tempo paga?"), botão "Registar venda a prestações". Ficha da cobrança: "Ficha do cliente" (e "Ficha do 2.º titular / fiador"), "Viatura", cartão "Segundo titular / fiador" ("Adicionar", "Trocar", "Tirar"), "Prestações" ("Acrescentar prestações" → "Acrescentar"), "Recebimentos" ("Registar recebimento"), "Valores da venda" ("Guardar valores"), "Guardar notas", "Apagar venda"; cartão "Contrato de assunção de responsabilidade" com "Gerar contrato" (revê outorgantes, viatura, prestação, financiamento opcional, IUC, cláusula penal, avalista/fiador com NIF e morada — vem do 2.º titular / fiador da venda —, data → "Gerar PDF") e a lista dos contratos gerados com "Descarregar". Na nova venda, a caixa "A seguir, gerar o contrato para assinar" abre logo esse formulário.

### Carros em legalização (/painel/legalizacao) [forms.generate]
Etapas: Modelo 9 e homologação → Alfândega (DAV) → Registo inicial. Botões "Clientes" e "Registo inicial". Para começar: escolher "Cliente", opcionalmente "Viatura do stock (opcional)", botão "Novo carro". Separadores: "Em curso", "Modelo 9", "Alfândega", "Registo inicial", "Concluído", "DAV em risco". Pesquisa por cliente, marca, matrícula ou VIN.

### Processo de legalização de um carro (/painel/legalizacao/ID)
Separadores no topo: "Modelo 9 e homologação", "Alfândega (DAV)", "Registo inicial", "Documentos". Barra com "Etapa: …", botão "Avançar para …" (ou "Marcar como concluído") e "Ver o carro no estoque". Grava sozinho.
- Modelo 9: caixa de IA para o livrete estrangeiro; "Dados da viatura"; "2. Cliente (requerente)" (botões das empresas, "Ou copiar de um cliente do stand", "Empresa"/"Particular"); "3. Modelo 9" ("Gerar Modelo 9 (PDF)", "Abrir Modelo 9", "Estado do Modelo 9"); "4. Homologação (IMT)" ("Site do IMT", "Copiar", "Descarregar N em PDF"); "5. Homologação e inspeção" (datas, centro e número da inspeção; botão "Voltou da inspeção: ir para a Alfândega").
- Alfândega (DAV): caixa de IA "Fatura, CMR e conta-quilómetros"; "Dados para a DAV" (a "Data de entrada em Portugal" conta o prazo de 20 dias úteis); "Casas da DAV" ("Copiar tudo", "Portal das Finanças"); "Documentos a anexar (casa 92)" com botão "PDF"; "Depois de submeter".
- Registo inicial: caixa de IA "Comprovativo do registo"; "Entrega no IMT — matrícula portuguesa"; "Registo de propriedade". A matrícula portuguesa passa para a ficha do carro.
- Documentos: "Documentos do carro"; escolher o tipo e "Fotografar" ou "Escolher ficheiros"; marcando várias caixas aparece "Juntar N em PDF".
- "Apagar" elimina o processo (os ficheiros ficam guardados).

### Clientes da legalização (/painel/legalizacao/clientes)
Empresas ou pessoas para quem se legalizam carros (ex.: Sucesso Prudente). Botão "Novo cliente" (caixa de IA "Preencher com documentos", botão "Criar cliente"). Na ficha: "Novo carro", "Só registo inicial", "Dados do cliente" com "Guardar", "Apagar cliente".

### Registo inicial (/painel/legalizacao/registo-inicial)
Escolher "Cliente" e "Novo registo inicial". Pesquisa e listas "Por registar" e "Registos feitos".

### Pedidos (CRM) (/painel/crm) [leads.view]
Pedidos de contacto do site e registados à mão. Botão "Registar pedido" [leads.edit] (diálogo → "Registar"). Fases: "Em aberto", "Novo", "Contactado", "Qualificado", "Em negociação", "Ganho", "Perdido". Pesquisa e "Só os meus". No pedido: "Ligar", "WhatsApp", "E-mail", "Fase", "Responsável", "Criar ficha de cliente" / "Abrir ficha de cliente", "Nova nota" → "Adicionar nota", "Apagar pedido".

### Anúncios (/painel/anuncios) [ads.view]
Só leitura: resultados da Meta (Facebook e Instagram) e do Google Ads; períodos "7 dias", "30 dias", "90 dias".

### Site (/painel/site) [site.edit]
Botão "Abrir o site". "Identidade e contactos" com "Guardar". "Capas do site (destaques)": "Nova capa"; em cada capa lápis (editar), olho ("Publicar no site"/"Retirar do site"), "Subir", "Descer", lixo; no editor "Guardar capa". Uma capa nova fica em rascunho até carregar no olho.

### Equipa (/painel/equipa) [users.manage]
"Utilizadores": "Novo utilizador" (campos "Nome", "Utilizador (para entrar)" — pode ser só o nome, ex.: italo, ou um e-mail; maiúsculas e acentos não contam — e "Função"; botão "Criar utilizador"); aparece a palavra-passe temporária uma única vez, com "Copiar" e "Já guardei". Em cada pessoa: lápis (editar) e chave ("Repor palavra-passe"). "Funções e permissões": "Nova função", marcar as permissões, "Guardar função".

### Atividade (/painel/atividade) [audit.view]
Registo de tudo o que cada pessoa fez. Filtros "Pessoa", "Área", "Contém" → "Filtrar"; "Ver registos mais antigos".

### Configurações (/painel/configuracoes) [site.edit]
"Empresa de vendas", "Empresa de aluguer", "Privacidade dos pedidos" (cada um com "Guardar"). "Modelos de documentos": "Carregar documento Word", "Descarregar exemplo para adaptar", "Descarregar o modelo", "Substituir pelo documento real", "Deixar de usar", "Guardar modelo", "Repor original". "Integrações" (só leitura).

### A minha conta (/painel/conta)
Abre-se ao tocar no próprio nome no fundo do menu. "Aparência" (tema). "Palavra-passe": "Palavra-passe atual", "Nova palavra-passe", "Repetir a nova palavra-passe" → "Guardar palavra-passe". "O que pode fazer": lista das permissões.

## Para que serve cada documento
- "Termo de garantia" e "Declaração de circulação": documentos da venda de um carro do stand a um cliente (gerados no separador "Venda" da ficha, ou em "Declarações").
- "Contrato de locação": aluguer de um carro (separador "Aluguer" da ficha, ou em "Declarações").
- "Contrato de consignação": quando o dono deixa o carro no stand para o stand o vender por ele.
- "Declaração de venda de viatura ao stand": quando alguém vende o seu carro AO stand.
- "Dados para o Requerimento de Registo Automóvel" e a página "Compra e venda": mudança de dono no registo automóvel (IRN).
- "Modelo 9", DAV e registo inicial: legalização de carros importados (páginas da Legalização).
- Documentos já gerados de um carro: separador "Termos" da ficha do carro ("Documentos gerados" → "Abrir"); de um cliente: separador "Termos" da ficha do cliente.

## Como fazer

Dar entrada de um carro novo:
1. "Dar entrada de viatura" (Início ou Viaturas), "Dar entrada de carro" (Estoque) ou "Adicionar carro à frota" (Aluguer).
2. Em "Preencher a partir de documentos": "Fotografar" ou "Escolher ficheiros" (DUA/livrete) e "Ler N documentos"; conferir os campos preenchidos a azul.
3. Em "Fotografias da viatura" juntar as fotos (opcional: "Identificar o carro pela foto").
4. Escolher "Venda", "Aluguer" ou "Só estoque"; se for importado marcar "Carro importado — começar a legalização".
5. "Criar viatura". Fica "Em preparação".

Fluxo normal de um carro importado: Entrada (fotos e documentos) → Preparação (lavado, fotografado) → Legalização (Modelo 9 e homologação, inspeção, Alfândega/DAV, registo inicial no IMT) → Destino (Venda no site, Aluguer ou Só estoque). Todos os carros ficam no Estoque com os custos.

Publicar ou tirar um carro do site (só carros de Venda, [vehicles.status]): abrir a ficha → "Disponível" (se não faltar nada fica logo publicado) ou "Publicar no site" / "Retirar do site". Se o botão estiver desligado, ver "Para publicar falta: …". Voltar a "Em preparação" também tira do site.

Mudar o destino: na ficha, "Destino do carro" → "Venda", "Aluguer" ou "Só estoque".

Lançar custos (reparações, manutenção, etc.): ficha → separador "Custos" → "Preço de compra" + "Guardar"; em "Custos adicionais" descrição + valor + "+". Total em "O carro está a sair por". Notas soltas (custo ainda por decidir, combinado com o mecânico): caixa "Anotações" no mesmo separador.

Fotos e documentos de um carro: separador "Fotografias" (a estrela marca a capa; "Fotografar com o telemóvel" no computador) e separador "Documentos" (tipo → "Fotografar" ou "Carregar").

Ler documentos com IA: nas caixas com ícone de faísca ("Preencher a partir de documentos", "Fotografias dos documentos", etc.) fotografar ou escolher até 8 ficheiros e "Ler N documentos". Campos vazios ficam preenchidos a azul; se já havia outro valor, usar "Usar o do documento".

Registar uma venda e gerar garantia e declarações: ficha do carro → "Venda" (ou menu "Compra e venda") → "Começar a compra e venda" → fotografar os documentos das pessoas e do carro na caixa 1 → conferir comprador, vendedor e fiador → "6. Pagamento" → "7. Declarações e documentos" ("Termo de garantia" e "Declaração de circulação" vêm marcados; deixar "Marcar a viatura como vendida") → "Rever dados dos documentos" → "Marcar como vendida e gerar documentos". Os documentos ficam na lista da parte 7, no separador "Termos" do carro e na ficha do cliente com o mesmo NIF.

Declaração ou documento avulso (sem carro, ou para tirar de novo): menu "Declarações" → escolher o cartão → fotografias dos documentos e "Ler…" (ou escrever à mão; pesquisas opcionais de cliente/viatura) → "Rever dados do documento" → "Gerar documento" → "Abrir".

Criar um cliente: Clientes → "Gerar ficha de cliente" → fotografar o documento de identificação → conferir → "Criar ficha de cliente". Também a partir de um pedido do CRM ("Criar ficha de cliente") ou dentro da venda/aluguer ("Novo cliente").

Alugar um carro: Aluguer → "Frota de aluguer" → "Alugar" (abre o separador "Aluguer" da ficha) → locatário e dados → "Rever dados do contrato" → "Registar aluguer e gerar contrato". Devolução: "Registar devolução" (Aluguer › "Alugados agora" ou na ficha) → data, hora, km → "Confirmar devolução". Mudar a data de fim: "Prolongar". O carro tem de ter destino Aluguer para aparecer na frota.

Venda a prestações: Cobranças → "Nova venda a prestações" (ou ficha do carro › "Venda") → cliente, viatura, valores e periodicidade → "Registar venda a prestações". Em cada prestação: "Recebido" → "Confirmar", ou "WhatsApp" para lembrar o cliente. Contrato para o cliente assinar (livrança, cláusula penal, retoma da posse): ficha da cobrança → "Contrato de assunção de responsabilidade" → "Gerar contrato" → rever → "Gerar PDF". Todos os documentos do painel saem em PDF.

Legalização de um carro importado: começar na ficha do carro ("3 · Legalização" → "Começar legalização"), na entrada do carro ("Carro importado — começar a legalização") ou em Legalização → escolher "Cliente" → "Novo carro". Depois: Modelo 9 (ler o livrete com IA, escolher o requerente, "Gerar Modelo 9 (PDF)", "Site do IMT" e "Copiar"; quando voltar da inspeção "Voltou da inspeção: ir para a Alfândega") → Alfândega/DAV (fatura, CMR e conta-quilómetros com IA; "Data de entrada em Portugal" conta 20 dias úteis; copiar as casas para o "Portal das Finanças"; PDF da casa 92) → Registo inicial (comprovativo, matrícula portuguesa e titular) → "Marcar como concluído". Carros com a DAV perto do prazo aparecem em "DAV em risco" e no Início.

Requerimento de registo automóvel (compra e venda para o IRN): menu "Compra e venda" → "Nova compra e venda" → documentos do comprador e do vendedor → "Quem é o comprador?" → viatura e data → "Gerar requerimento (PDF)".

Criar utilizador: Equipa → "Novo utilizador" → "Nome", "Utilizador (para entrar)" (ex.: italo), "Função" → "Criar utilizador" → entregar a palavra-passe temporária ("Copiar", "Já guardei"). Na primeira entrada a pessoa escolhe a sua palavra-passe. Funções: "Nova função" → marcar permissões → "Guardar função". Esqueceu a palavra-passe: o administrador carrega na chave ("Repor palavra-passe") em Equipa.

Trocar a palavra-passe: tocar no próprio nome no fundo do menu ("A minha conta") → "Palavra-passe" → "Guardar palavra-passe".

Capa do site e dados do stand: menu "Site" → "Identidade e contactos" + "Guardar"; "Capas do site (destaques)" → "Nova capa" (ou lápis) → escolher a viatura e as fotos, ajustar o enquadramento → "Guardar capa" → olho ("Publicar no site").

Pedidos de contacto: "Pedidos (CRM)" → abrir o pedido → "Ligar"/"WhatsApp", mudar "Fase" e "Responsável", "Adicionar nota".

Tema claro/escuro: botão de sol/lua no fundo do menu ou "A minha conta" › "Aparência".

Sair: ícone de porta com seta no fundo do menu (no telemóvel abrir primeiro o menu ☰).
`;
