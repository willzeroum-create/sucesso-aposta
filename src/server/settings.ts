import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SiteConfig } from "@/lib/contracts";
import { demoSiteConfig } from "@/data/demo";

/** Dados legais do stand usados nos termos (vendedor). Nunca públicos por si só. */
export interface CompanyInfo {
  legalName: string;
  nipc: string;
  address: string;
  postalCode: string;
  city: string;
  representativeName: string;
  representativeRole: string;
  licenseNumber: string;
}

export interface PrivacySettings {
  /** Texto do consentimento mostrado no formulário e guardado com cada pedido. */
  consentText: string;
  /** URL da política de privacidade (opcional enquanto não existir). */
  policyUrl: string;
  /** Meses de retenção dos pedidos de contacto não convertidos. */
  leadRetentionMonths: number;
}

const DEFAULT_COMPANY: CompanyInfo = {
  legalName: "",
  nipc: "",
  address: "",
  postalCode: "",
  city: "",
  representativeName: "",
  representativeRole: "Gerente",
  licenseNumber: "",
};

const DEFAULT_PRIVACY: PrivacySettings = {
  consentText: "Autorizo o tratamento dos dados que forneci para responder a este pedido.",
  policyUrl: "",
  leadRetentionMonths: 24,
};

async function read<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  if (!row) return fallback;
  return { ...fallback, ...(row.value as object) } as T;
}

export async function writeSetting(key: string, value: unknown, userId: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
}

/** A única origem do SiteConfig público (o dashboard edita esta chave). */
export function getSiteConfig(): Promise<SiteConfig> {
  return read<SiteConfig>("site", { ...demoSiteConfig, contacts: undefined });
}

export function getCompanyInfo(): Promise<CompanyInfo> {
  return read("company", DEFAULT_COMPANY);
}

export function getPrivacySettings(): Promise<PrivacySettings> {
  return read("privacy", DEFAULT_PRIVACY);
}
