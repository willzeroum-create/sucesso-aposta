import Image from "next/image";
import Link from "next/link";
import { and, eq, isNotNull } from "drizzle-orm";
import photos from "@/data/photo-credits.json";
import { db, schema } from "@/db";
import { publicUrl } from "@/server/storage";
import styles from "./page.module.css";

export const metadata = { title: "Fotografias e créditos | Aposta com Sucesso Cars" };
export const dynamic = "force-dynamic";

/** Fotografias de terceiros guardadas nas viaturas (ex.: viaturas por encomenda), com autor e licença. */
async function vehiclePhotoCredits() {
  try {
    return await db
      .select({ id: schema.vehiclePhotos.id, credit: schema.vehiclePhotos.credit, creditUrl: schema.vehiclePhotos.creditUrl, key: schema.files.storageKey, make: schema.vehicles.make, model: schema.vehicles.model, alt: schema.vehiclePhotos.alt })
      .from(schema.vehiclePhotos)
      .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
      .innerJoin(schema.vehicles, eq(schema.vehicles.id, schema.vehiclePhotos.vehicleId))
      .where(and(isNotNull(schema.vehiclePhotos.credit), eq(schema.vehicles.published, true), eq(schema.vehicles.section, "site")));
  } catch {
    return [];
  }
}

export default async function PhotoCredits() {
  const credits = await vehiclePhotoCredits();
  return (
    <main className={styles.page}>
      <Link href="/">← Voltar à coleção</Link>
      <p className={styles.eyebrow}>SUCESSO APOSTA · BIBLIOTECA VISUAL</p>
      <h1>
        Fotografias <em>com origem.</em>
      </h1>
      <p>
        As viaturas em stock usam fotografias do próprio stand. As viaturas
        marcadas <strong>“Por encomenda”</strong> e algumas imagens da página
        usam fotografias de referência de terceiros, com licença livre: mostram
        o modelo, não a unidade concreta que será encomendada.
      </p>
      {credits.length > 0 && (
        <div className={styles.grid}>
          {credits.map((c) => (
            <article key={c.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicUrl(c.key)} alt={c.alt || `${c.make} ${c.model}`} loading="lazy" style={{ width: "100%", height: "auto" }} />
              <div>
                <h2>
                  {c.make} {c.model}
                </h2>
                <p>{c.credit}</p>
                {c.creditUrl && (
                  <p>
                    <a href={c.creditUrl} target="_blank" rel="noreferrer">
                      Fotografia original
                    </a>
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
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
