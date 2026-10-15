# Assistente da equipa no WhatsApp — arquitetura (ainda não ativo)

O código base existe mas **não está ligado**: não há rota de webhook nem página no painel. Ativar só quando o stand tiver um número na WhatsApp Cloud API e o site estiver online (a Meta precisa de um endereço HTTPS público).

## O que faz

Conversa guiada só com a **equipa** (não é atendimento a clientes):

| A pessoa envia | O assistente faz |
| --- | --- |
| Várias fotografias | Espera o lote acabar (6 s sem novas) e pergunta *de que viatura?* (lista das últimas viaturas + "Nova viatura"). Junta-as como fotografias (WebP). |
| 1–2 fotografias | Pergunta se é da viatura ou de um documento. |
| Documento (foto/PDF) | Lê com IA. Se for DUA/livrete/CoC, encontra a viatura pela matrícula ou VIN e confirma; se não existir, propõe criá-la. Se for Cartão de Cidadão, propõe criar/atualizar a ficha de cliente (pelo NIF). |
| "Nova viatura" | Pede o documento ou texto livre (*BMW 320d, AA-12-BB, 64000 km, 28900 €*), mostra o resumo, cria em preparação e pergunta *Publicar no site / Em preparação*. Se faltar algo para publicar, diz o quê e aceita correções por texto. |
| Uma matrícula | Mostra a viatura e permite mudar o estado (preparação, disponível, reservado, vendido). |
| `menu`, `stock`, `cancelar` | Menu, resumo do stock, cancelar o que estiver em curso. |

Segue as preferências do utilizador: preenche logo o que lê, avisa o que falta, pede confirmação só antes de criar.

## Peças

| Peça | Ficheiro | Estado |
| --- | --- | --- |
| Tabelas `wa_inbox` (fila, idempotência por wamid), `wa_sessions` (estado da conversa), `wa_messages` (histórico) e `users.whatsapp_phone` | `src/db/schema.ts` | criadas |
| Cliente da Cloud API: texto, botões, listas, descarga de média, assinatura `x-hub-signature-256`, parse do webhook | `src/server/whatsapp/cloud.ts` | escrito |
| Motor da conversa (estados, fluxos, permissões, auditoria) | `src/server/whatsapp/bot.ts` | escrito, por testar |
| Webhook `GET/POST /api/whatsapp/webhook` (grava na fila antes do 200, trata em `after()`) | — | por fazer (modelo: brm veiculos) |
| Simulador no painel (testar sem WhatsApp, número virtual `sim-<utilizador>`) | — | por fazer |
| Associar o número de cada pessoa em Equipa | — | por fazer |

## Segurança

- Só números associados a um utilizador **ativo**; cada ação verifica as permissões desse utilizador e fica no registo de atividade ("Pelo WhatsApp: …").
- Assinatura da Meta obrigatória em produção (`WHATSAPP_APP_SECRET`).
- Mensagens recebidas são dados, nunca instruções (também no texto enviado à IA).
- Média descarregada só de domínios da Meta; documentos guardados como privados.

## Para ativar

Variáveis: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION` (opcional). Na Meta: app Business com WhatsApp, número verificado, webhook para `https://<domínio>/api/whatsapp/webhook` com o campo `messages`.
