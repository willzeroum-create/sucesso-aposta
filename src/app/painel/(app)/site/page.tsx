import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { HeroManager, SiteConfigForm } from "@/components/painel/site-forms";
import { Alert } from "@/components/painel/ui";
import { requirePagePermission } from "@/server/auth/session";
import { buildPublicCatalog } from "@/server/public-catalog";
import { getSiteConfig } from "@/server/settings";
import { publicUrl } from "@/server/storage";

export const metadata = { title: "Site" };

export default async function SitePage() {
  await requirePagePermission("site.edit");
  const site = await getSiteConfig();
  const mode = process.env.CATALOG_MODE ?? "demo";
  const catalog = await buildPublicCatalog();

  const vehicles = await db.select().from(schema.vehicles).orderBy(asc(schema.vehicles.make));
  const photos = await db
    .select({ vehicleId: schema.vehiclePhotos.vehicleId, key: schema.files.storageKey })
    .from(schema.vehiclePhotos)
    .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
    .orderBy(asc(schema.vehiclePhotos.position));
  const heroVehicles = vehicles
    .filter((v) => v.status !== "sold" && v.section === "site")
    .map((v) => ({
      id: v.id,
      label: `${v.make} ${v.model}${v.version ? ` ${v.version}` : ""}`,
      published: v.published && v.status !== "preparation",
      photos: photos.filter((p) => p.vehicleId === v.id).map((p) => publicUrl(p.key)),
    }));
  const heroes = await db.select().from(schema.heroSlides).orderBy(asc(schema.heroSlides.position));
  const label = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.make} ${v.model}` : "Viatura removida";
  };

  return (
    <div className="a-page" style={{ maxWidth: 1100 }}>
      <div className="a-head">
        <div>
          <h1>Site</h1>
          <p>Nome, contactos e capas da página pública. As viaturas publicam-se na página de cada viatura.</p>
        </div>
        <a href="/" target="_blank" rel="noopener" className="a-btn">
          Abrir o site
        </a>
      </div>

      {mode === "database" ? (
        <Alert kind="ok" title="O site está ligado a este painel">
          <p>
            Publicadas agora: {catalog.vehicles.length} viatura(s) e {catalog.heroSlides.length} capa(s). As alterações aparecem no site de imediato.
          </p>
        </Alert>
      ) : (
        <Alert kind="warn" title={`O site está em modo “${mode}”`}>
          <p>
            A página pública ainda mostra {mode === "demo" ? "os exemplos de demonstração" : "o catálogo remoto"}. Para ligar ao painel, defina{" "}
            <span className="a-code">CATALOG_MODE=database</span> no servidor e reinicie. Neste momento ficariam publicadas {catalog.vehicles.length} viatura(s)
            {catalog.vehicles.length === 0 ? " — publique pelo menos uma antes de mudar" : ""}.
          </p>
        </Alert>
      )}

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Identidade e contactos</h2>
            <p>Fonte única do nome e contactos mostrados no site e no título do navegador.</p>
          </div>
        </div>
        <div className="a-card-body">
          <SiteConfigForm
            initial={{
              name: site.name,
              tagline: site.tagline,
              phone: site.contacts?.phone ?? "",
              whatsapp: site.contacts?.whatsapp ?? "",
              email: site.contacts?.email ?? "",
              address: site.contacts?.address ?? "",
            }}
          />
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Capas do site (destaques)</h2>
            <p>Cada capa usa fotografias reais da viatura, com enquadramento próprio para computador e telemóvel.</p>
          </div>
        </div>
        <div className="a-card-body">
          <HeroManager
            vehicles={heroVehicles}
            heroes={heroes.map((h) => ({
              id: h.id,
              vehicleId: h.vehicleId,
              vehicleLabel: label(h.vehicleId),
              imageDesktop: h.imageDesktop,
              imageMobile: h.imageMobile,
              objectPositionDesktop: h.objectPositionDesktop,
              objectPositionMobile: h.objectPositionMobile,
              textTone: h.textTone,
              eyebrow: h.eyebrow,
              headline: h.headline,
              headlineAccent: h.headlineAccent,
              description: h.description,
              published: h.published,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
