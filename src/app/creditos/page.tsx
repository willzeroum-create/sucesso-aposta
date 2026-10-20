import Image from "next/image";
import Link from "next/link";
import photos from "@/data/photo-credits.json";
import styles from "./page.module.css";

export const metadata = { title: "Fotografias e créditos | Aposta com Sucesso Cars" };

export default function PhotoCredits() {
  return (
    <main className={styles.page}>
      <Link href="/">← Voltar à coleção</Link>
      <p className={styles.eyebrow}>SUCESSO APOSTA · BIBLIOTECA VISUAL</p>
      <h1>
        Fotografias <em>com origem.</em>
      </h1>
      <p>
        Esta coleção é demonstrativa. As fotografias de referência mostram
        unidades semelhantes; os preços, quilometragens e características são
        fictícios e não constituem uma oferta de venda.
      </p>
      <div className={styles.grid}>
        {photos.vehicles.map((photo) => (
          <article key={photo.id}>
            <Image
              src={photo.image}
              width={photo.width}
              height={photo.height}
              sizes="(max-width: 650px) 100vw, 50vw"
              alt={`${photo.model} — ${photo.color}`}
            />
            <div>
              <h2>{photo.model}</h2>
              <p>{"attribution" in photo ? photo.attribution : photo.author}</p>
              <p>
                <a href={photo.source} target="_blank" rel="noreferrer">
                  Fotografia original
                </a>{" "}
                ·{" "}
                <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
                  {photo.license}
                </a>
              </p>
              <p>{photo.note}</p>
            </div>
          </article>
        ))}
      </div>
      <section>
        <h2>Imagens de apresentação</h2>
        <p>
          Os cenários do Mustang vermelho, Polestar 2 e Peugeot 2008 azul foram
          criados com inteligência artificial a partir das referências
          fornecidas pelo proprietário do projeto. São composições ilustrativas,
          não fotografias documentais do estado das viaturas nem do stand.
        </p>
        <p>
          As fotografias adicionais fornecidas pelo proprietário mantêm a sua
          origem e não recebem as licenças das imagens acima. As imagens
          pesquisadas são apresentadas com redimensionamento, compressão e
          enquadramento responsivo; os originais estão ligados em cada crédito.
        </p>
        <p>
          O habitáculo é de Ajeet Panesar e a estrada costeira é de Scott
          Taylor, disponibilizados através do Unsplash. As fontes completas
          estão registadas na documentação de assets do projeto.
        </p>
      </section>
    </main>
  );
}
