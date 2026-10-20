/**
 * Stock do parceiro Tampinha Cars (tampinhacars.pt, plataforma AUTO21 — da mesma empresa, Sucesso Prudente).
 * Lê a lista de viaturas e cada anúncio (preço, características, equipamento, fotografias) e mantém o nosso
 * stock igual: cria o que é novo, atualiza preço/km/dados, descarrega as fotografias para o nosso armazenamento
 * e retira do site o que deixou de estar anunciado. Nunca duplica (origem + id do anúncio, ou VIN/matrícula).
 */
import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatPlate, normalizeVin } from "@/lib/pt-validation";
import { mapFuel } from "@/server/ai/documents";
import { newId, slugify } from "@/server/ids";
import { storeVehiclePhoto } from "@/server/storage";

export const PARTNER = "tampinha";
export const PARTNER_LABEL = "Tampinha Cars";
const BASE = "https://tampinhacars.pt";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_PHOTOS = 20;

export interface PartnerCar {
  ref: string;
  url: string;
  make: string;
  model: string;
  version: string;
  type: string;
  year: number | null;
  mileageKm: number | null;
  fuel: "petrol" | "diesel" | "hybrid" | "electric" | null;
  transmission: "automatic" | "manual" | null;
  powerHp: number | null;
  engineCc: number | null;
  vin: string | null;
  plate: string | null;
  color: string | null;
  doors: number | null;
  seats: number | null;
  priceEur: number | null;
  features: string[];
  notes: string;
  photos: string[];
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return res.text();
}

/** Entidades com nome mais comuns em português (á, ã, ç, º, €…). */
const NAMED: Record<string, string> = {
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô", atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  agrave: "à", Agrave: "À", ccedil: "ç", Ccedil: "Ç", ordm: "º", ordf: "ª", euro: "€", deg: "°", middot: "·", ndash: "–", mdash: "—",
};
const decode = (s: string) =>
  s
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => NAMED[name] ?? m)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Texto visível da página, uma linha por bloco. */
function textLines(html: string): string[] {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, "").replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export interface ListingItem {
  ref: string;
  url: string;
  /** Preço do cartão (vem mesmo quando o anúncio diz "Preço sob consulta"). */
  price: number | null;
  sold: boolean;
}

/** Cartões da página /viaturas: id do anúncio, preço e etiqueta VENDIDO. */
export function parseListing(html: string): ListingItem[] {
  const seen = new Map<string, ListingItem>();
  for (const card of html.split(/class="result-item/).slice(1)) {
    const m = card.match(/\/viatura\/(\d+)\/([a-z0-9-]+)/i);
    if (!m || seen.has(m[1])) continue;
    const price = Number(card.match(/data-preco="(\d+)"/)?.[1] ?? "");
    seen.set(m[1], { ref: m[1], url: `${BASE}/viatura/${m[1]}/${m[2]}`, price: price > 0 ? price : null, sold: />\s*VENDIDO\s*</i.test(card) });
  }
  // Se o desenho dos cartões mudar, pelo menos as ligações.
  if (!seen.size)
    for (const m of html.matchAll(/\/viatura\/(\d+)\/([a-z0-9-]+)/gi))
      if (!seen.has(m[1])) seen.set(m[1], { ref: m[1], url: `${BASE}/viatura/${m[1]}/${m[2]}`, price: null, sold: false });
  return [...seen.values()];
}

/** Primeiro número do texto: "129 111 Km" → 129111, "0 Cm3" → null (o 3 de cm3 não conta). */
const int = (v: string | undefined) => {
  const m = (v ?? "").match(/\d[\d .]*/);
  const n = m ? Number(m[0].replace(/[ .]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** "Outro" é o valor por omissão da plataforma quando não há versão. */
const version = (s: string) => (/^outro$/i.test(s.trim()) ? "" : cap(s.trim()));
const FUEL_PT = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" } as const;
const GENERIC_NOTE = /rotina inform[aá]tica|carecem de confirma/i;

export function parseDetail(html: string, ref: string, url: string): PartnerCar {
  const lines = textLines(html);
  // "Características": pares "Rótulo:" + valor.
  const spec: Record<string, string> = {};
  const start = lines.indexOf("Características");
  if (start >= 0)
    for (let i = start + 1; i < lines.length - 1 && i < start + 80; i++) {
      const l = lines[i];
      if (/^\+?\d[\d ]{6,}$/.test(l)) break; // telefone: acabou o bloco
      if (l.endsWith(":")) {
        const next = lines[i + 1];
        if (!next.endsWith(":")) {
          spec[l.slice(0, -1).toLowerCase()] = next;
          i++;
        }
      }
    }
  const eqStart = lines.indexOf("Equipamento");
  const eqEnd = [lines.indexOf("Dados Técnicos"), lines.indexOf("Anotações"), start].filter((n) => n > eqStart).sort((a, b) => a - b)[0] ?? -1;
  const features = eqStart >= 0 && eqEnd > eqStart ? [...new Set(lines.slice(eqStart + 1, eqEnd))] : [];
  const priceLine = lines.find((l) => /^\d[\d .]*\s*Eur\.?$/i.test(l));
  const notesStart = lines.indexOf("Anotações");
  const notesEnd = priceLine ? lines.indexOf(priceLine) : -1;
  const notes = notesStart >= 0 && notesEnd > notesStart ? lines.slice(notesStart + 1, notesEnd).filter((l) => !GENERIC_NOTE.test(l)).join("\n") : "";
  const trans = (spec["transmissão"] ?? spec["caixa"] ?? "").toLowerCase();
  const fuel = mapFuel(spec["combustivel"] ?? spec["combustível"] ?? "") ?? null;
  const photos = [
    ...new Set([...html.matchAll(new RegExp(`https?://www\\.auto21\\.pt/tampinha/imagens_viaturas/${ref}/[^"'\\s)]+\\.(?:jpe?g|png|webp)`, "gi"))].map((m) => m[0])),
  ].slice(0, MAX_PHOTOS);
  const vin = spec["vin"] ? normalizeVin(spec["vin"]) : null;
  // Alguns anúncios trazem o modelo vazio e o nome na versão (ex.: Mercedes Benz · "" · E-sprinter).
  let model = (spec["modelo"] ?? "").trim();
  let ver = version(spec["versão"] ?? spec["versao"] ?? "");
  if (!model && ver) [model, ver] = [ver, ""];
  return {
    ref,
    url,
    make: (spec["marca"] ?? "").trim(),
    model,
    version: ver,
    type: spec["tipo"] ?? "",
    year: int((spec["ano e mês"] ?? spec["ano"] ?? "").match(/(19|20)\d{2}/)?.[0]),
    mileageKm: int(spec["kms"] ?? spec["km"]),
    fuel,
    transmission: /autom/.test(trans) ? "automatic" : /manual/.test(trans) ? "manual" : null,
    powerHp: int(spec["potencia"] ?? spec["potência"]),
    engineCc: int(spec["cilindrada"]),
    vin: vin && vin.length >= 11 ? vin : null,
    plate: spec["matrícula"] ? formatPlate(spec["matrícula"]) : null,
    color: spec["cor"] ?? null,
    doors: int(spec["portas"]),
    seats: int(spec["lugares"]),
    priceEur: priceLine ? int(priceLine) : null,
    features,
    notes,
    photos,
  };
}

function categoryOf(type: string): "coupe" | "saloon" | "suv" | "estate" {
  const t = type.toLowerCase();
  if (/suv|todo.?o.?terreno|crossover|jipe/.test(t)) return "suv";
  if (/carrinha|station|break|touring|sw|monovolume|comercial/.test(t)) return "estate";
  if (/coup|cabrio|descapot/.test(t)) return "coupe";
  return "saloon";
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "viatura";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [hit] = await db.select({ id: schema.vehicles.id }).from(schema.vehicles).where(eq(schema.vehicles.slug, candidate)).limit(1);
    if (!hit) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

async function importPhotos(vehicleId: string, label: string, urls: string[], userId: string): Promise<number> {
  let position = 0;
  let cover: string | null = null;
  for (const [i, u] of urls.entries()) {
    try {
      const res = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const stored = await storeVehiclePhoto(Buffer.from(await res.arrayBuffer()), `${slugify(label)}-${i + 1}.jpg`, userId);
      const photoId = newId("pho");
      await db.insert(schema.vehiclePhotos).values({ id: photoId, vehicleId, fileId: stored.id, alt: label, position: position++ });
      cover ??= photoId;
    } catch {
      // uma fotografia falhada não trava as outras
    }
  }
  if (cover) await db.update(schema.vehicles).set({ coverPhotoId: cover }).where(and(eq(schema.vehicles.id, vehicleId), isNull(schema.vehicles.coverPhotoId)));
  return position;
}

export interface SyncResult {
  listed: number;
  created: number;
  updated: number;
  linked: number;
  unpublished: number;
  photos: number;
  pendingPhotos: number;
  errors: string[];
}

/**
 * Sincroniza o stock do parceiro. `deadline` (ms) evita passar o tempo de um pedido: o que ficar por fazer
 * (normalmente fotografias) faz-se na próxima vez.
 */
export async function syncTampinha(opts: { userId: string; deadline?: number; log?: (m: string) => void }): Promise<SyncResult> {
  const log = opts.log ?? (() => {});
  const late = () => opts.deadline !== undefined && Date.now() > opts.deadline;
  const r: SyncResult = { listed: 0, created: 0, updated: 0, linked: 0, unpublished: 0, photos: 0, pendingPhotos: 0, errors: [] };
  const listing = parseListing(await fetchText(`${BASE}/viaturas`));
  r.listed = listing.length;
  if (!listing.length) throw new Error("A lista de viaturas da Tampinha Cars veio vazia. O site pode ter mudado.");

  for (const item of listing) {
    if (late()) {
      r.pendingPhotos++;
      continue;
    }
    let car: PartnerCar;
    try {
      car = parseDetail(await fetchText(item.url), item.ref, item.url);
    } catch (e) {
      r.errors.push(`${item.url}: ${e instanceof Error ? e.message : "falhou"}`);
      continue;
    }
    if (!car.make || !car.model) {
      r.errors.push(`${item.url}: sem marca/modelo`);
      continue;
    }
    const label = [car.make, car.model, car.version].filter(Boolean).join(" ");
    const data = {
      make: car.make,
      model: car.model,
      // O site precisa de uma versão: sem ela, usa o tipo do anúncio (ex.: "SUV", "Carrinha").
      version: car.version || cap(car.type.trim()) || (car.fuel ? FUEL_PT[car.fuel] : ""),
      category: categoryOf(car.type),
      year: car.year,
      mileageKm: car.mileageKm,
      fuel: car.fuel,
      // Elétricos são sempre automáticos.
      transmission: car.transmission ?? (car.fuel === "electric" ? "automatic" : null),
      powerHp: car.powerHp,
      priceEur: car.priceEur ?? item.price,
      engineCc: car.engineCc,
      vin: car.vin,
      plate: car.plate,
      ...(car.color ? { color: car.color } : {}),
      ...(car.doors ? { doors: car.doors } : {}),
      ...(car.seats ? { seats: car.seats } : {}),
      features: car.features,
      description: car.notes || null,
      sourcePartner: PARTNER,
      sourceRef: car.ref,
      sourceUrl: car.url,
      sourceSyncedAt: new Date(),
    };

    // Já existe? Pelo anúncio; senão pelo VIN ou matrícula (viatura que já estava no stock).
    let [existing] = await db
      .select()
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.sourcePartner, PARTNER), eq(schema.vehicles.sourceRef, car.ref)))
      .limit(1);
    let linked = false;
    if (!existing && (car.vin || car.plate)) {
      const conds = [car.vin ? eq(schema.vehicles.vin, car.vin) : undefined, car.plate ? eq(schema.vehicles.plate, car.plate) : undefined].filter(Boolean);
      [existing] = await db
        .select()
        .from(schema.vehicles)
        .where(and(isNull(schema.vehicles.sourcePartner), or(...(conds as [ReturnType<typeof eq>]))))
        .limit(1);
      linked = Boolean(existing);
    }

    let vehicleId: string;
    if (!existing) {
      vehicleId = newId("veh");
      await db.insert(schema.vehicles).values({
        id: vehicleId,
        slug: await uniqueSlug(label),
        status: item.sold ? "sold" : "available",
        published: true,
        supplier: PARTNER_LABEL,
        createdBy: opts.userId,
        ...data,
        // O preço do anúncio fica como referência; no site aparece "sob consulta" até a equipa o confirmar.
        priceOnRequest: true,
      });
      r.created++;
      log(`+ ${label} (${data.priceEur ?? "?"} €${item.sold ? ", vendido" : ""})`);
    } else if (linked) {
      // Viatura que já tínhamos: só completa o que está vazio e passa a seguir o anúncio.
      const fill = Object.fromEntries(Object.entries(data).filter(([k, v]) => v != null && (existing as Record<string, unknown>)[k] == null));
      await db.update(schema.vehicles).set({ ...fill, sourcePartner: PARTNER, sourceRef: car.ref, sourceUrl: car.url, sourceSyncedAt: new Date(), updatedAt: new Date() }).where(eq(schema.vehicles.id, existing.id));
      vehicleId = existing.id;
      r.linked++;
      log(`= ${label} (ligada a uma viatura que já existia)`);
    } else {
      // Anúncio do parceiro: os dados de lá mandam (km, versão… e se foi vendido). Reservado cá mantém-se.
      // O preço é definido cá no painel: nunca é substituído pelo do anúncio.
      // Vendido lá → vendido cá. Uma venda feita cá (com data de venda) nunca volta a disponível.
      const status = item.sold ? "sold" : existing.status === "sold" && !existing.soldAt ? "available" : existing.status;
      // O que o anúncio não traz não apaga o que a equipa completou à mão no painel.
      const known = Object.fromEntries(Object.entries(data).filter(([k, v]) => k !== "priceEur" && v !== null && v !== undefined && v !== ""));
      await db.update(schema.vehicles).set({ ...known, status, updatedAt: new Date() }).where(eq(schema.vehicles.id, existing.id));
      vehicleId = existing.id;
      r.updated++;
      log(`~ ${label} (${data.priceEur ?? "?"} €${item.sold ? ", vendido" : ""})`);
    }

    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.vehiclePhotos).where(eq(schema.vehiclePhotos.vehicleId, vehicleId));
    if (Number(n) === 0 && car.photos.length) {
      if (late()) r.pendingPhotos++;
      else {
        const got = await importPhotos(vehicleId, label, car.photos, opts.userId);
        r.photos += got;
        log(`  ${got} fotografias`);
      }
    }
  }

  // O que deixou de estar anunciado sai do site (fica no painel).
  if (!late()) {
    const refs = listing.map((l) => l.ref);
    const gone = await db
      .select({ id: schema.vehicles.id, ref: schema.vehicles.sourceRef })
      .from(schema.vehicles)
      .where(and(eq(schema.vehicles.sourcePartner, PARTNER), eq(schema.vehicles.published, true)));
    const toHide = gone.filter((g) => g.ref && !refs.includes(g.ref)).map((g) => g.id);
    if (toHide.length) {
      await db.update(schema.vehicles).set({ published: false, updatedAt: new Date() }).where(inArray(schema.vehicles.id, toHide));
      r.unpublished = toHide.length;
    }
  }
  return r;
}
