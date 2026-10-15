/**
 * Esquema relacional do backoffice (SQLite/libSQL).
 * Local: ficheiro em ./data/app.db. Produção: Turso (DATABASE_URL + DATABASE_AUTH_TOKEN).
 * Alterações: editar aqui, `npm.cmd run db:generate` e confirmar a migração gerada em ./drizzle.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

/* ───────────────────────── Acesso ───────────────────────── */

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  /** Lista JSON de chaves de permissão (ver src/server/auth/permissions.ts). */
  permissions: text("permissions", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  /** O papel de administrador do sistema não pode ser apagado nem perder permissões. */
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
    /** Número de WhatsApp (só algarismos, com indicativo) autorizado a usar o assistente da equipa. */
    whatsappPhone: text("whatsapp_phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 do token do cookie; o token em claro nunca é guardado. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLogs = sqliteTable(
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
    changes: text("changes", { mode: "json" }).$type<
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

export const files = sqliteTable(
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

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
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

export const vehicles = sqliteTable(
  "vehicles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    status: text("status", { enum: VEHICLE_STATUSES })
      .notNull()
      .default("preparation"),
    /** Só aparece no site quando published=true e status≠preparation. */
    published: integer("published", { mode: "boolean" })
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
    priceEur: real("price_eur"),
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
    purchasePriceEur: real("purchase_price_eur"),
    purchaseDate: text("purchase_date"),
    supplier: text("supplier"),
    internalNotes: text("internal_notes"),
    soldAt: integer("sold_at", { mode: "timestamp_ms" }),
    soldPriceEur: real("sold_price_eur"),
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

export const vehiclePhotos = sqliteTable(
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

export const customers = sqliteTable(
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

export const leads = sqliteTable(
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
    consentAt: integer("consent_at", { mode: "timestamp_ms" }).notNull(),
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

export const leadEvents = sqliteTable(
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

export const documents = sqliteTable(
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
    extracted: text("extracted", { mode: "json" }).$type<
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
export const generatedForms = sqliteTable(
  "generated_forms",
  {
    id: text("id").primaryKey(),
    template: text("template").notNull(),
    vehicleId: text("vehicle_id"),
    customerId: text("customer_id"),
    /** Valores exatos usados no preenchimento, para reprodução e auditoria. */
    data: text("data", { mode: "json" })
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

/* ───────────────────────── Site / hero ───────────────────────── */

export const heroSlides = sqliteTable("hero_slides", {
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
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  updatedBy: text("updated_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const heroJobs = sqliteTable("hero_jobs", {
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
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────── Infra ───────────────────────── */

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});

/* ───────────────────────── WhatsApp (assistente da equipa) ───────────────────────── */

/** Caixa de entrada: cada mensagem recebida é gravada antes de responder à Meta (nada se perde). */
export const waInbox = sqliteTable(
  "wa_inbox",
  {
    /** wamid da Meta (ou id do simulador): garante que a mesma mensagem não é tratada duas vezes. */
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "done", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("wa_inbox_status_idx").on(t.status, t.createdAt)],
);

/** Estado da conversa com cada pessoa da equipa (o que o assistente está à espera de receber). */
export const waSessions = sqliteTable("wa_sessions", {
  phone: text("phone").primaryKey(),
  state: text("state").notNull().default("idle"),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  lastMediaAt: integer("last_media_at", { mode: "timestamp_ms" }),
  updatedAt: updatedAt(),
});

/** Histórico das mensagens (entrada e saída), mostrado no painel. */
export const waMessages = sqliteTable(
  "wa_messages",
  {
    id: text("id").primaryKey(),
    phone: text("phone").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    body: text("body").notNull(),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("wa_messages_phone_idx").on(t.phone, t.createdAt)],
);
