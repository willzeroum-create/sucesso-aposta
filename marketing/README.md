# Redes sociais — Sucesso Promissor

Posts (feed 4:5) e Reels/Stories (9:16) feitos com Remotion a partir das **fotografias reais** dos carros do site.

1. Exportar carros e fotos da base de dados (na raiz do projeto do site):
   `npx tsx --conditions=react-server marketing/scripts/export-cars.mts`
   (a lista de carros está em `IDS` no script; as fotos escolhidas para capa e vídeo ficam em `pick` no `src/data/cars.json`).
2. Ver e afinar no estúdio (dentro de `marketing/`): `npm run dev`
3. Renderizar tudo para `out/`: `npm run render:all` (ou `node scripts/render-all.mjs <slug>` para um carro).
4. Legendas prontas a copiar: `legendas.md` (vai também para `out/legendas.md`).

Sem preços, prestações nem percentagens nas peças: publicidade a crédito em Portugal exige a TAEG.
