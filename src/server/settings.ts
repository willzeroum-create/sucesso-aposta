import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SiteConfig } from "@/lib/contracts";
import { demoSiteConfig } from "@/data/demo";

/** Dados legais da empresa emitente dos documentos. Nunca públicos por si só. */
export interface CompanyInfo {
  legalName: string;
  nipc: string;
  address: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  instagram: string;
  representativeName: string;
  representativeRole: string;
  licenseNumber: string;
  /** Código de acesso à certidão permanente (Modelo 9 com a empresa como requerente). */
  certCode: string;
}

/** Duas empresas: vendas (termo de garantia, declaração de circulação) e aluguer (contrato de locação). */
export type CompanyKind = "sale" | "rent";

export interface PrivacySettings {
  /** Texto do consentimento mostrado no formulário e guardado com cada pedido. */
  consentText: string;
  /** URL da política de privacidade (opcional enquanto não existir). */
  policyUrl: string;
  /** Meses de retenção dos pedidos de contacto não convertidos. */
  leadRetentionMonths: number;
}

// Dados das empresas tal como constam nos documentos originais do stand (editáveis em Configurações).
const DEFAULT_COMPANY: Record<CompanyKind, CompanyInfo> = {
  sale: {
    legalName: "Sucesso Prudente, Unipessoal Lda",
    nipc: "514904372",
    address: "Rua Marechal Gomes da Costa, Vivenda VJP",
    postalCode: "1685-901",
    city: "Famões",
    phone: "960346671",
    email: "apostapromissoracar@gmail.com",
    instagram: "",
    representativeName: "",
    representativeRole: "Gerente",
    licenseNumber: "",
    certCode: "",
  },
  rent: {
    legalName: "Aposta Promissora Unipessoal Lda",
    nipc: "517503867",
    address: "Rua Marechal Gomes da Costa nº123",
    postalCode: "",
    city: "Famões/Odivelas - Lisboa",
    phone: "923321054",
    email: "apostapromissoracar@gmail.com",
    instagram: "@apostapromissora",
    representativeName: "",
    representativeRole: "Gerente",
    licenseNumber: "",
    certCode: "",
  },
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

/** Anúncios de parceiros apagados no painel: a sincronização não os volta a criar. */
export async function getDeletedPartnerRefs(partner: string): Promise<string[]> {
  const v = await read<Record<string, string[]>>("partner_deleted_refs", {});
  return Array.isArray(v[partner]) ? v[partner] : [];
}

export async function addDeletedPartnerRef(partner: string, ref: string, userId: string): Promise<void> {
  const v = await read<Record<string, string[]>>("partner_deleted_refs", {});
  const list = new Set(Array.isArray(v[partner]) ? v[partner] : []);
  list.add(ref);
  await writeSetting("partner_deleted_refs", { ...v, [partner]: [...list] }, userId);
}

/** A única origem do SiteConfig público (o dashboard edita esta chave). */
export function getSiteConfig(): Promise<SiteConfig> {
  return read<SiteConfig>("site", { ...demoSiteConfig, contacts: undefined });
}

export function getCompanyInfo(kind: CompanyKind = "sale"): Promise<CompanyInfo> {
  return read(kind === "sale" ? "company" : "company_rent", DEFAULT_COMPANY[kind]);
}

export function getPrivacySettings(): Promise<PrivacySettings> {
  return read("privacy", DEFAULT_PRIVACY);
}
