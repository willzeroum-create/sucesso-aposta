# Verificação da primeira entrega

14 de outubro de 2026. Ambiente local Windows, Node.js 24.19.0, Next.js 16.4.1 e catálogo demonstrativo. A página foi revista no navegador integrado do Codex em `http://127.0.0.1:3100`.

## Verificações executadas

- `npm.cmd run typecheck`: aprovado após a integração final.
- `npm.cmd run build`: compilação de produção aprovada após a integração final.
- Larguras de 320, 390, 768 e 1440 px: sem overflow horizontal do documento.
- Troca manual entre os destaques Porsche, Mercedes-Benz e BMW. Títulos sem overflow em 320 px; imagem, texto e viatura associados a cada seleção.
- Inspeção visual do hero em desktop/mobile, grelhas em uma/duas/três colunas, ficha mobile, secção editorial, procura personalizada e formulário.
- Menu mobile abre, navega e fecha. Os links internos conduzem às secções.
- Filtro SUV apresenta três exemplos. Pesquisa Volvo reduz a coleção a uma viatura. Pesquisa sem resultados apresenta ação para repor os filtros, que restaura as seis viaturas.
- Favorito acrescentado, filtrado, mantido após recarregar e removido no fim do teste.
- Ficha abre como diálogo nativo. “Tenho interesse” fecha a ficha, associa a viatura e passa o foco para o nome no formulário.
- Formulário vazio apresenta erros associados aos campos obrigatórios. Pedido válido em modo demo mostra “Demonstração concluída. O pedido não foi enviado nem guardado.” Os dados de QA utilizados foram fictícios.
- Diálogo de informações abre e fecha com Escape.
- Nenhuma imagem quebrada nem mensagem de erro/aviso na consola foi observada nos estados inspecionados.

As rotinas de catálogo e de contacto também foram exercitadas durante a implementação com respostas HTTP simuladas: 19 casos para o catálogo e 14 para validação/respostas de leads, além da revisão de associação da viatura a pedidos de visita. Esses harnesses foram pontuais; não há uma suite persistida nem um script `npm test` nesta fase.

## Limites

Não foram executados testes contra backend real, autenticação, base de dados, serviço de email ou gerador de imagens. O modo remoto permanece preparado por contrato. A inspeção visual e de foco não equivale a uma auditoria completa WCAG, teste em aparelhos físicos ou medição de desempenho em produção.

O projeto está local, sem publicação pública. Stock, identidade legal, contactos, política de privacidade e integrações continuam por confirmar. O `noindex` mantém a pré-visualização fora da indexação pretendida; rever quando o lançamento real estiver autorizado.
