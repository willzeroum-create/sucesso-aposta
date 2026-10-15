/**
 * Esquema relacional do backoffice (PostgreSQL — Supabase).
 * Ligação: DATABASE_URL (pooler de transações, porta 6543). Migrações: DATABASE_URL_MIGRATIONS (porta 5432).
 * Alterações: editar aqui, `npm.cmd run db:generate` e confirmar a migração gerada em ./drizzle.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

/* ───────────────────────── Acesso ───────────────────────── */

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  /** Lista JSON de chaves de permissão (ver src/server/auth/permissions.ts). */
  permissions: jsonb("permissions")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  /** O papel de administrador do sistema não pode ser apagado nem perder permissões. */
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "date" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
    /** Número de WhatsApp (só algarismos, com indicativo) autorizado a usar o assistente da equipa. */
    whatsappPhone: text("whatsapp_phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 do token do cookie; o token em claro nunca é guardado. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    /** Nome copiado no momento da ação, para o registo sobreviver à remoção do utilizador. */
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    /** Alterações campo a campo { campo: [antes, depois] }; nunca dados de documentos de identificação. */
    changes: jsonb("changes").$type<
      Record<string, [unknown, unknown]>
    >(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_created_idx").on(t.createdAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_user_idx").on(t.userId),
  ],
);

/* ───────────────────────── Ficheiros ───────────────────────── */

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey(),
    /** Chave no driver de armazenamento (disco local ou Vercel Blob). */
    storageKey: text("storage_key").notNull(),
    /** public = fotografias publicáveis; private = documentos (só com sessão e permissão). */
    visibility: text("visibility", { enum: ["public", "private"] }).notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalName: text("original_name").notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: text("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("files_storage_key_unique").on(t.storageKey)],
);

/* ───────────────────────── Stand ───────────────────────── */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: updatedAt(),
});

export const VEHICLE_STATUSES = [
  "preparation",
  "available",
  "reserved",
  "sold",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const vehicles = pgTable(
  "vehicles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    status: text("status", { enum: VEHICLE_STATUSES })
      .notNull()
      .default("preparation"),
    /** Só aparece no site quando published=true e status≠preparation. */
    published: boolean("published")
      .notNull()
      .default(false),
    make: text("make").notNull(),
    model: text("model").notNull(),
    version: text("version").notNull().default(""),
    category: text("category", {
      enum: ["coupe", "saloon", "suv", "estate"],
    })
      .notNull()
      .default("saloon"),
    year: integer("year"),
    mileageKm: integer("mileage_km"),
    fuel: text("fuel", { enum: ["petrol", "diesel", "hybrid", "electric"] }),
    transmission: text("transmission", { enum: ["automatic", "manual"] }),
    powerHp: integer("power_hp"),
    priceEur: doublePrecision("price_eur"),
    highlight: text("highlight"),
    description: text("description"),
    coverPhotoId: text("cover_photo_id"),

    // Identificação e registo (do DUA / certificado de matrícula)
    plate: text("plate"),
    vin: text("vin"),
    color: text("color"),
    engineCc: integer("engine_cc"),
    doors: integer("doors"),
    seats: integer("seats"),
    firstRegistration: text("first_registration"),
    registrationDate: text("registration_date"),
    registrationOwner: text("registration_owner"),
    vehicleType: text("vehicle_type"),
    brandCode: text("brand_code"),
    homologation: text("homologation"),
    grossWeightKg: integer("gross_weight_kg"),
    tareKg: integer("tare_kg"),
    co2: integer("co2"),
    nextInspection: text("next_inspection"),

    // Dados internos (nunca públicos)
    purchasePriceEur: doublePrecision("purchase_price_eur"),
    purchaseDate: text("purchase_date"),
    supplier: text("supplier"),
    internalNotes: text("internal_notes"),
    soldAt: timestamp("sold_at", { withTimezone: true, mode: "date" }),
    soldPriceEur: doublePrecision("sold_price_eur"),
    buyerCustomerId: text("buyer_customer_id"),

    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("vehicles_slug_unique").on(t.slug),
    index("vehicles_status_idx").on(t.status),
    index("vehicles_plate_idx").on(t.plate),
  ],
);

export const vehiclePhotos = pgTable(
  "vehicle_photos",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id),
    alt: text("alt").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("vehicle_photos_vehicle_idx").on(t.vehicleId, t.position)],
);

/* ───────────────────────── CRM ───────────────────────── */

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    nif: text("nif"),
    idDocumentType: text("id_document_type"),
    idDocumentNumber: text("id_document_number"),
    idDocumentExpiry: text("id_document_expiry"),
    idDocumentIssuer: text("id_document_issuer"),
    birthDate: text("birth_date"),
    nationality: text("nationality"),
    address: text("address"),
    postalCode: text("postal_code"),
    city: text("city"),
    country: text("country"),
    drivingLicenseNumber: text("driving_license_number"),
    drivingLicenseIssuedAt: text("driving_license_issued_at"),
    notes: text("notes"),
    source: text("source"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customers_name_idx").on(t.fullName),
    index("customers_nif_idx").on(t.nif),
  ],
);

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "negotiation",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    message: text("message").notNull(),
    intent: text("intent", {
      enum: ["vehicle", "sourcing", "visit", "general"],
    }).notNull(),
    vehicleId: text("vehicle_id"),
    /** Texto do consentimento apresentado, guardado como prova. */
    consentText: text("consent_text").notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true, mode: "date" }).notNull(),
    status: text("status", { enum: LEAD_STATUSES }).notNull().default("new"),
    source: text("source").notNull().default("site"),
    assignedTo: text("assigned_to"),
    customerId: text("customer_id"),
    /** Hash do pedido para descartar submissões repetidas na mesma janela. */
    dedupeKey: text("dedupe_key").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    ipHash: text("ip_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_status_idx").on(t.status, t.createdAt),
    index("leads_dedupe_idx").on(t.dedupeKey, t.createdAt),
    index("leads_vehicle_idx").on(t.vehicleId),
  ],
);

export const leadEvents = pgTable(
  "lead_events",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    userName: text("user_name").notNull(),
    type: text("type", { enum: ["note", "status", "assign", "link"] }).notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lead_events_lead_idx").on(t.leadId, t.createdAt)],
);

/* ───────────────────────── Documentos ───────────────────────── */

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type", { enum: ["vehicle", "customer"] }).notNull(),
    ownerId: text("owner_id").notNull(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    fileId: text("file_id")
      .notNull()
      .references(() => files.id),
    /** Campos extraídos pela IA e confirmados (ou não) por uma pessoa. */
    extracted: jsonb("extracted").$type<
      Record<string, unknown>
    >(),
    extractionStatus: text("extraction_status", {
      enum: ["none", "pending", "done", "failed", "applied"],
    })
      .notNull()
      .default("none"),
    expiresOn: text("expires_on"),
    uploadedBy: text("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [index("documents_owner_idx").on(t.ownerType, t.ownerId)],
);

/** Termos e declarações preenchidos a partir dos dados do stand, cliente e viatura. */
export const generatedForms = pgTable(
  "generated_forms",
  {
    id: text("id").primaryKey(),
    template: text("template").notNull(),
    vehicleId: text("vehicle_id"),
    customerId: text("customer_id"),
    /** Valores exatos usados no preenchimento, para reprodução e auditoria. */
    data: jsonb("data")
      .$type<Record<string, string>>()
      .notNull(),
    fileId: text("file_id").references(() => files.id),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("forms_vehicle_idx").on(t.vehicleId),
    index("forms_customer_idx").on(t.customerId),
  ],
);

/** Alugueres: quem alugou, prazo, km de saída/entrega e valor. */
export const rentals = pgTable(
  "rentals",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    kmOut: integer("km_out"),
    kmIn: integer("km_in"),
    totalEur: doublePrecision("total_eur"),
    paymentMethod: text("payment_method"),
    notes: text("notes"),
    status: text("status", { enum: ["active", "closed", "cancelled"] }).notNull().default("active"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rentals_vehicle_idx").on(t.vehicleId, t.startAt)],
);

/** Legalização de carros importados: Modelo 9 do IMT e pedido de homologação. */
export const legalizations = pgTable(
  "legalizations",
  {
    id: text("id").primaryKey(),
    /** Viatura do stock a que o processo diz respeito (opcional). */
    vehicleId: text("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    requester: jsonb("requester").$type<Record<string, string>>().notNull().default({}),
    vehicle: jsonb("vehicle").$type<Record<string, string>>().notNull().default({}),
    /** Fotografias/PDF dos documentos (livrete estrangeiro, CoC, documentos do requerente). */
    fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
    modelo9FileId: text("modelo9_file_id"),
    status: text("status", { enum: ["draft", "generated", "submitted", "done"] }).notNull().default("draft"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("legalizations_updated_idx").on(t.updatedAt)],
);

/** Custos de cada viatura (transporte, legalização, reparações…) para a ficha financeira. */
export const vehicleCosts = pgTable(
  "vehicle_costs",
  {
    id: text("id").primaryKey(),
    vehicleId: text("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    amountEur: doublePrecision("amount_eur").notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("vehicle_costs_vehicle_idx").on(t.vehicleId, t.date)],
);

/* ───────────────────────── Cobranças (vendas a prestações) ───────────────────────── */
// Valores em cêntimos (inteiros), datas AAAA-MM-DD — como na app Cobrar de onde vieram.

export const chargeContracts = pgTable(
  "charge_contracts",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    vehicleId: text("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    make: text("make").notNull().default(""),
    model: text("model").notNull().default(""),
    color: text("color").notNull().default(""),
    year: integer("year"),
    plate: text("plate").notNull().default(""),
    vin: text("vin").notNull().default(""),
    deliveryDate: text("delivery_date"),
    saleCents: integer("sale_cents").notNull().default(0),
    /** Parte paga pelo banco/financeira: o stand não cobra isto. */
    financedCents: integer("financed_cents").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("charge_contracts_customer_idx").on(t.customerId)],
);

export const chargeInstallments = pgTable(
  "charge_installments",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => chargeContracts.id, { onDelete: "cascade" }),
    dueDate: text("due_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("charge_installments_contract_idx").on(t.contractId, t.dueDate)],
);

export const chargePayments = pgTable(
  "charge_payments",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id")
      .notNull()
      .references(() => chargeContracts.id, { onDelete: "cascade" }),
    /** null = entrada ou pagamento avulso (abate só no saldo). */
    installmentId: text("installment_id").references(() => chargeInstallments.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").notNull().default("dinheiro"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("charge_payments_contract_idx").on(t.contractId), index("charge_payments_installment_idx").on(t.installmentId)],
);

/* ───────────────────────── Site / hero ───────────────────────── */

export const heroSlides = pgTable("hero_slides", {
  id: text("id").primaryKey(),
  vehicleId: text("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  imageDesktop: text("image_desktop").notNull(),
  imageMobile: text("image_mobile").notNull(),
  objectPositionDesktop: text("object_position_desktop")
    .notNull()
    .default("50% 50%"),
  objectPositionMobile: text("object_position_mobile")
    .notNull()
    .default("50% 50%"),
  textTone: text("text_tone", { enum: ["light", "dark"] })
    .notNull()
    .default("light"),
  eyebrow: text("eyebrow").notNull(),
  headline: text("headline").notNull(),
  headlineAccent: text("headline_accent"),
  description: text("description").notNull(),
  position: integer("position").notNull().default(0),
  published: boolean("published").notNull().default(false),
  updatedBy: text("updated_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const heroJobs = pgTable("hero_jobs", {
  id: text("id").primaryKey(),
  vehicleId: text("vehicle_id").notNull(),
  status: text("status", {
    enum: ["queued", "processing", "review", "approved", "rejected", "failed"],
  })
    .notNull()
    .default("queued"),
  sourceFileId: text("source_file_id").notNull(),
  creativeBrief: text("creative_brief").notNull(),
  desktopFileId: text("desktop_file_id"),
  mobileFileId: text("mobile_file_id"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  attempts: integer("attempts").notNull().default(0),
  requestedBy: text("requested_by").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────── Infra ───────────────────────── */

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: bigint("reset_at", { mode: "number" }).notNull(),
});

/* ───────────────────────── WhatsApp (assistente da equipa) ───────────────────────── */

/** Caixa de entrada: cada mensagem recebida é gravada antes de responder à Meta (nada se perde). */
export const waInbox = pgTable(
  "wa_inbox",
  {
    /** wamid da Meta (ou id do simulador): garante que a mesma mensagem não é tratada duas vezes. */
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "done", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [index("wa_inbox_status_idx").on(t.status, t.createdAt)],
);

/** Estado da conversa com cada pessoa da equipa (o que o assistente está à espera de receber). */
export const waSessions = pgTable("wa_sessions", {
  phone: text("phone").primaryKey(),
  state: text("state").notNull().default("idle"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  lastMediaAt: timestamp("last_media_at", { withTimezone: true, mode: "date" }),
  updatedAt: updatedAt(),
});

/** Histórico das mensagens (entrada e saída), mostrado no painel. */
export const waMessages = pgTable(
  "wa_messages",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    body: text("body").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("wa_messages_phone_idx").on(t.phone, t.createdAt)],
);
