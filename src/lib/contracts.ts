/** Shared public contracts. Keep this module free of server code and secrets. */
export type VehicleCategory = "coupe" | "saloon" | "suv" | "estate";
export type VehicleFuel = "petrol" | "diesel" | "hybrid" | "electric";

export interface Vehicle {
  id: string;
  slug: string;
  make: string;
  model: string;
  version: string;
  category: VehicleCategory;
  year: number;
  mileageKm: number;
  fuel: VehicleFuel;
  transmission: "automatic" | "manual";
  powerHp: number;
  priceEur: number;
  image: string;
  imageAlt: string;
  highlight?: string;
  status: "available" | "reserved" | "sold";
}

export interface HeroSlide {
  id: string;
  vehicleId: string;
  imageDesktop: string;
  imageMobile: string;
  /** CSS object-position, for example "66% 50%". */
  objectPositionDesktop: string;
  objectPositionMobile: string;
  textTone: "light" | "dark";
  eyebrow: string;
  headline: string;
  headlineAccent?: string;
  description: string;
}

export interface SiteConfig {
  name: string;
  tagline: string;
  locale: "pt-PT";
  currency: "EUR";
  contacts?: {
    /** International format, for example +351 followed by the actual number. */
    phone?: string;
    email?: string;
    /** International digits only, suitable for a wa.me link. */
    whatsapp?: string;
    address?: string;
  };
}

/** JSON contract for GET /api/public/catalog, implemented by the future backend. */
export interface PublicCatalogPayload {
  site: SiteConfig;
  vehicles: Vehicle[];
  heroSlides: HeroSlide[];
}

/** The server adapter determines source; it is never trusted from remote JSON. */
export interface CatalogData extends PublicCatalogPayload {
  source: "demo" | "remote";
}

export interface LeadInput {
  fullName: string;
  email: string;
  phone?: string;
  message: string;
  intent: "vehicle" | "sourcing" | "visit" | "general";
  vehicleId?: string;
  consent: boolean;
}

export interface AcceptedLeadResponse {
  status: "accepted";
  leadId: string;
}

/** A local preview confirmation only: no request, delivery, or persistence. */
export interface DemoLeadResponse {
  status: "demo";
  message: string;
}

export type LeadResponse = AcceptedLeadResponse | DemoLeadResponse;

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Partial<Record<keyof LeadInput, string>>;
  };
}

/** Private dashboard job contract; never call a generation provider from the browser. */
export interface HeroGenerationRequest {
  vehicleId: string;
  /** Original authenticated upload, with usage rights and provenance recorded. */
  sourceImageAssetId: string;
  creativeBrief: string;
  requestedBy: string;
}

export interface HeroGenerationJob {
  id: string;
  vehicleId: string;
  status:
    "queued" | "processing" | "review" | "approved" | "rejected" | "failed";
  sourceImageAssetId: string;
  desktopAssetId?: string;
  mobileAssetId?: string;
  error?: { code: string; message: string };
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}
