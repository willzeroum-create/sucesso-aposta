/**
 * Exporta da base de dados do painel os carros escolhidos para as redes sociais, com as fotografias reais.
 * Grava marketing/src/data/cars.json e marketing/public/cars/<slug>/<n>.webp.
 *
 * Correr na raiz do projeto do site (precisa do .env.local):
 *   npx tsx --conditions=react-server marketing/scripts/export-cars.mts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { asc, eq, inArray } from "drizzle-orm";

config({ path: [".env.local", ".env"], quiet: true });
const { createDb } = await import("../../src/db/client");
const schema = await import("../../src/db/schema");
const { getObject } = await import("../../src/server/storage");

/** Carros do stand (fotos tiradas no stand) e da Tampinha Cars (mesma empresa). */
const IDS = [
  "veh_mvh186exjw1i6nxg5k", // Ford Mustang Mach-E 2021
  "veh_mvh18c1d3u5cdrdc45", // Polestar 2 2023
  "veh_mvh188im7q71u9wjab", // Peugeot 2008 Active Pack 2023
  "veh_mvh184nd9dtziqhi37", // Peugeot 2008 Allure 2021
  "veh_mvgto3a9mnjc3as47w", // Jaguar I-Pace 2019
  "veh_mvgtn3j4mowvo9zg4i", // BYD Atto 2 2025
  "veh_mvgtmsryz6yuuxzk17", // Audi A3 2020
  "veh_mvgtpzzd12zbgy7xqq", // Renault Mégane E-Tech 2023
];

const FUEL: Record<string, string> = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" };
const GEARBOX: Record<string, string> = { automatic: "Automática", manual: "Manual" };
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ROOT = path.resolve("marketing");
const db = createDb();
const vehicles = await db.select().from(schema.vehicles).where(inArray(schema.vehicles.id, IDS));
const photos = await db
  .select({ id: schema.vehiclePhotos.id, vehicleId: schema.vehiclePhotos.vehicleId, position: schema.vehiclePhotos.position, key: schema.files.storageKey })
  .from(schema.vehiclePhotos)
  .innerJoin(schema.files, eq(schema.files.id, schema.vehiclePhotos.fileId))
  .where(inArray(schema.vehiclePhotos.vehicleId, IDS))
  .orderBy(asc(schema.vehiclePhotos.position));

const out = [];
for (const id of IDS) {
  const v = vehicles.find((x) => x.id === id);
  if (!v) {
    console.log(`! não encontrado: ${id}`);
    continue;
  }
  const slug = slugify(`${v.make} ${v.model} ${v.year ?? ""}`);
  const dir = path.join(ROOT, "public", "cars", slug);
  await mkdir(dir, { recursive: true });
  const own = photos.filter((p) => p.vehicleId === id);
  // capa primeiro, depois pela ordem do painel
  own.sort((a, b) => (a.id === v.coverPhotoId ? -1 : b.id === v.coverPhotoId ? 1 : a.position - b.position));
  const files: string[] = [];
  for (const [i, p] of own.entries()) {
    const data = await getObject(p.key);
    if (!data) {
      console.log(`  ! foto em falta ${p.key}`);
      continue;
    }
    const file = `${i + 1}.webp`;
    await writeFile(path.join(dir, file), data);
    files.push(`cars/${slug}/${file}`);
  }
  out.push({
    id: v.id,
    slug,
    make: v.make,
    model: v.model,
    version: v.version,
    year: v.year,
    mileageKm: v.mileageKm,
    fuel: v.fuel ? FUEL[v.fuel] : null,
    transmission: v.transmission ? GEARBOX[v.transmission] : null,
    powerHp: v.powerHp,
    color: v.color,
    features: (v.features ?? []).slice(0, 6),
    photos: files,
    // escolhidas à mão depois de ver as fotos (índices em `photos`)
    pick: { cover: 0, reel: files.slice(0, 4).map((_, i) => i) },
  });
  console.log(`+ ${v.make} ${v.model} ${v.year} → ${files.length} fotos (${slug})`);
}
await mkdir(path.join(ROOT, "src", "data"), { recursive: true });
await writeFile(path.join(ROOT, "src", "data", "cars.json"), JSON.stringify(out, null, 2) + "\n");
console.log("ok");
