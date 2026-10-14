import "server-only";

import { demoCatalog } from "@/data/demo";
import type {
  CatalogData,
  HeroSlide,
  PublicCatalogPayload,
  SiteConfig,
  Vehicle,
} from "@/lib/contracts";

export class CatalogLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogLoadError";
  }
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CatalogLoadError(
      `Invalid catalogue field: ${path} must be an object.`,
    );
  }
  return value as JsonObject;
}

function text(value: unknown, path: string, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new CatalogLoadError(
      `Invalid catalogue field: ${path} must be non-empty text (max ${max}).`,
    );
  }
  return value.trim();
}

function optionalText(
  value: unknown,
  path: string,
  max = 1000,
): string | undefined {
  return value === undefined || value === null
    ? undefined
    : text(value, path, max);
}

function number(
  value: unknown,
  path: string,
  min: number,
  max: number,
  integer = true,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new CatalogLoadError(
      `Invalid catalogue field: ${path} must be a number between ${min} and ${max}.`,
    );
  }
  return value;
}

function member<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new CatalogLoadError(
      `Invalid catalogue field: ${path} has an unsupported value.`,
    );
  }
  return value as T;
}

function identifier(value: unknown, path: string): string {
  const result = text(value, path, 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result)) {
    throw new CatalogLoadError(
      `Invalid catalogue field: ${path} must be a URL-safe identifier.`,
    );
  }
  return result;
}

function imageUrl(value: unknown, path: string): string {
  const result = text(value, path, 2048);
  if (/^\/(?!\/)/.test(result) && !/[\\\r\n]/.test(result)) return result;
  try {
    const url = new URL(result);
    if (url.protocol === "https:" && !url.username && !url.password)
      return result;
  } catch {
    // Report the same safe validation error for all malformed URLs.
  }
  throw new CatalogLoadError(
    `Invalid catalogue field: ${path} must be a local image path or HTTPS URL.`,
  );
}

function objectPosition(value: unknown, path: string): string {
  const result = text(value, path, 50);
  const coordinate = "(?:100(?:\\.0+)?|\\d{1,2}(?:\\.\\d+)?)%";
  const pattern = new RegExp(
    `^(?:${coordinate} ${coordinate}|(?:left|center|right)(?: (?:top|center|bottom))?)$`,
  );
  if (!pattern.test(result))
    throw new CatalogLoadError(
      `Invalid catalogue field: ${path} must be a safe object-position.`,
    );
  return result;
}

function parseSite(value: unknown): SiteConfig {
  const site = object(value, "site");
  const result: SiteConfig = {
    name: text(site.name, "site.name", 100),
    tagline: text(site.tagline, "site.tagline", 240),
    locale: member(site.locale, ["pt-PT"], "site.locale"),
    currency: member(site.currency, ["EUR"], "site.currency"),
  };
  if (site.contacts !== undefined && site.contacts !== null) {
    const contacts = object(site.contacts, "site.contacts");
    const phone = optionalText(contacts.phone, "site.contacts.phone", 30);
    const email = optionalText(contacts.email, "site.contacts.email", 254);
    const whatsapp = optionalText(
      contacts.whatsapp,
      "site.contacts.whatsapp",
      15,
    );
    const address = optionalText(
      contacts.address,
      "site.contacts.address",
      300,
    );
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone))
      throw new CatalogLoadError(
        "Invalid catalogue field: site.contacts.phone must use international format.",
      );
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new CatalogLoadError(
        "Invalid catalogue field: site.contacts.email.",
      );
    if (whatsapp && !/^[1-9]\d{6,14}$/.test(whatsapp))
      throw new CatalogLoadError(
        "Invalid catalogue field: site.contacts.whatsapp must contain international digits only.",
      );
    result.contacts = { phone, email, whatsapp, address };
  }
  return result;
}

function parseVehicle(value: unknown, index: number): Vehicle {
  const path = `vehicles[${index}]`;
  const row = object(value, path);
  return {
    id: identifier(row.id, `${path}.id`),
    slug: identifier(row.slug, `${path}.slug`),
    make: text(row.make, `${path}.make`, 100),
    model: text(row.model, `${path}.model`, 100),
    version: text(row.version, `${path}.version`, 160),
    category: member(
      row.category,
      ["coupe", "saloon", "suv", "estate"],
      `${path}.category`,
    ),
    year: number(
      row.year,
      `${path}.year`,
      1900,
      new Date().getUTCFullYear() + 1,
    ),
    mileageKm: number(row.mileageKm, `${path}.mileageKm`, 0, 2000000),
    fuel: member(
      row.fuel,
      ["petrol", "diesel", "hybrid", "electric"],
      `${path}.fuel`,
    ),
    transmission: member(
      row.transmission,
      ["automatic", "manual"],
      `${path}.transmission`,
    ),
    powerHp: number(row.powerHp, `${path}.powerHp`, 1, 5000),
    priceEur: number(row.priceEur, `${path}.priceEur`, 1, 100000000, false),
    image: imageUrl(row.image, `${path}.image`),
    imageAlt: text(row.imageAlt, `${path}.imageAlt`, 300),
    highlight: optionalText(row.highlight, `${path}.highlight`, 120),
    status: member(
      row.status,
      ["available", "reserved", "sold"],
      `${path}.status`,
    ),
  };
}

function parseHero(value: unknown, index: number): HeroSlide {
  const path = `heroSlides[${index}]`;
  const row = object(value, path);
  return {
    id: identifier(row.id, `${path}.id`),
    vehicleId: identifier(row.vehicleId, `${path}.vehicleId`),
    imageDesktop: imageUrl(row.imageDesktop, `${path}.imageDesktop`),
    imageMobile: imageUrl(row.imageMobile, `${path}.imageMobile`),
    objectPositionDesktop: objectPosition(
      row.objectPositionDesktop,
      `${path}.objectPositionDesktop`,
    ),
    objectPositionMobile: objectPosition(
      row.objectPositionMobile,
      `${path}.objectPositionMobile`,
    ),
    textTone: member(row.textTone, ["light", "dark"], `${path}.textTone`),
    eyebrow: text(row.eyebrow, `${path}.eyebrow`, 150),
    headline: text(row.headline, `${path}.headline`, 160),
    headlineAccent: optionalText(
      row.headlineAccent,
      `${path}.headlineAccent`,
      160,
    ),
    description: text(row.description, `${path}.description`, 500),
  };
}

/** Runtime boundary: reject broken contracts rather than publishing misleading demo data. */
export function parsePublicCatalog(value: unknown): PublicCatalogPayload {
  const body = object(value, "catalogue");
  if (!Array.isArray(body.vehicles) || body.vehicles.length > 1000) {
    throw new CatalogLoadError(
      "Invalid catalogue field: vehicles must be an array with at most 1000 entries.",
    );
  }
  if (
    !Array.isArray(body.heroSlides) ||
    body.heroSlides.length < 1 ||
    body.heroSlides.length > 12
  ) {
    throw new CatalogLoadError(
      "Invalid catalogue field: heroSlides must contain between 1 and 12 entries.",
    );
  }
  const vehicles = body.vehicles.map(parseVehicle);
  const heroSlides = body.heroSlides.map(parseHero);
  const ids = new Set(vehicles.map((vehicle) => vehicle.id));
  const slugs = new Set(vehicles.map((vehicle) => vehicle.slug));
  if (ids.size !== vehicles.length || slugs.size !== vehicles.length)
    throw new CatalogLoadError(
      "Catalogue vehicle IDs and slugs must be unique.",
    );
  if (new Set(heroSlides.map((slide) => slide.id)).size !== heroSlides.length)
    throw new CatalogLoadError("Catalogue hero IDs must be unique.");
  for (const slide of heroSlides) {
    if (!ids.has(slide.vehicleId))
      throw new CatalogLoadError(
        `Hero ${slide.id} references an unknown vehicle.`,
      );
  }
  return { site: parseSite(body.site), vehicles, heroSlides };
}

export async function getCatalogData(): Promise<CatalogData> {
  const mode = process.env.CATALOG_MODE ?? "demo";
  if (mode === "demo")
    return { ...parsePublicCatalog(demoCatalog), source: "demo" };
  if (mode !== "remote")
    throw new CatalogLoadError("CATALOG_MODE must be demo or remote.");

  const endpoint = process.env.CATALOG_API_URL;
  if (!endpoint)
    throw new CatalogLoadError(
      "CATALOG_API_URL is required when CATALOG_MODE=remote.",
    );
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new CatalogLoadError("CATALOG_API_URL must be an absolute URL.");
  }
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && localDevelopment)) ||
    url.username ||
    url.password
  ) {
    throw new CatalogLoadError(
      "CATALOG_API_URL must use HTTPS (HTTP localhost is allowed in development).",
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(process.env.CATALOG_API_TOKEN
          ? { Authorization: `Bearer ${process.env.CATALOG_API_TOKEN}` }
          : {}),
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new CatalogLoadError(
      "The catalogue service is unavailable or exceeded its 8-second timeout.",
    );
  }
  if (!response.ok)
    throw new CatalogLoadError(
      `The catalogue service returned HTTP ${response.status}.`,
    );
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    throw new CatalogLoadError(
      "The catalogue service did not return application/json.",
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CatalogLoadError("The catalogue service returned invalid JSON.");
  }
  return { ...parsePublicCatalog(body), source: "remote" };
}
