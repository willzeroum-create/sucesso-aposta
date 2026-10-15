# Revisão da proposta 02 — 14/10/2026

Direção **Drive Studio** em `/`, com a proposta original preservada em `/conceito-a`. Revisão no navegador local, em modo de demonstração. Não constitui validação do dashboard, de persistência ou de serviços externos.

## Resultado visual e funcional

- Desktop a 1440 px, tablet a 768 px e mobile a 390 e 320 px: sem transbordamento horizontal da página ou títulos cortados nas medições efetuadas.
- Troca entre as duas propostas confirmada nos dois sentidos. O regresso à primeira proposta mantém a composição original.
- Os três destaques e os três painéis de princípios mudam corretamente.
- Pesquisa, orçamento máximo, categoria, ordenação e reposição dos filtros verificados. Pesquisa sem resultados apresenta estado vazio.
- Favoritos persistem após recarregar; filtro e remoção verificados. A sessão de revisão terminou sem favoritos de teste.
- Comparação de duas e três viaturas abre os dados correspondentes; uma quarta seleção fica indisponível. No mobile, a tabela tem deslocamento horizontal dentro do diálogo e uma indicação visível para deslizar.
- A ação de contacto na comparação e no detalhe associa a viatura correta ao formulário e coloca foco no campo de nome. Escape fecha o diálogo e devolve o foco ao botão de origem.
- Menu mobile, navegação por âncoras, regresso ao topo, perguntas expansíveis e diálogo de privacidade verificados.
- Formulário: campos obrigatórios, consentimento e simulação com dados fictícios verificados. A confirmação indica expressamente que nenhum pedido foi enviado ou guardado.

## Verificação de código e limite atual

O typecheck e o build passaram após a implementação inicial desta alternativa. Enquanto a revisão visual decorria, foram acrescentados ficheiros e dependências do backend por trabalho paralelo.

O último typecheck global executado terminou com este erro nesse código:

```text
src/server/storage.ts(119,34): error TS2503: Cannot find namespace 'sharp'.
```

O último build global também ficou bloqueado na fase de TypeScript pelo backend. Nessa execução havia, adicionalmente, referências a `@vercel/blob` ainda indisponíveis; esse erro deixou de aparecer no typecheck seguinte. A tipagem de `sharp.OutputInfo` continuava pendente. Nenhum ficheiro de backend foi corrigido ou revertido por este trabalho visual. Após a conclusão do backend, repetir `npm.cmd run typecheck` e `npm.cmd run build` para validar a árvore completa.

Os hashes originais de `showroom.tsx`, `globals.css`, `contracts.ts`, `inquiry-form.tsx` e `lead-client.ts` foram confirmados iguais no final da revisão. `catalog.ts` recebeu a integração de base de dados do trabalho paralelo; essa alteração foi preservada.

## Evidências

- `preview/drive-desktop.jpg`: abertura desktop.
- `preview/drive-mobile.jpg`: abertura mobile a 390 px.
- `preview/drive-garagem.jpg`: catálogo desktop.
- `preview/drive-comparacao.jpg`: comparação de três viaturas no desktop.
- `CONCEITOS.md`: organização das duas alternativas e procedimento de regresso à primeira.

Não foram testados autenticação, submissão real de leads, stock de produção, uploads, geração de imagens ou o dashboard nesta revisão visual.
