import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatPlate } from "@/lib/pt-validation";
import { getTemplates } from "./forms";

export async function templateInfos() {
  const all = await getTemplates();
  return Object.values(all).map(({ id, title, description, needsCustomer, needsVehicle }) => ({ id, title, description, needsCustomer, needsVehicle }));
}

export async function customerOptions() {
  const rows = await db.select({ id: schema.customers.id, fullName: schema.customers.fullName, nif: schema.customers.nif }).from(schema.customers).orderBy(asc(schema.customers.fullName)).limit(2000);
  return rows.map((c) => ({ id: c.id, label: c.nif ? `${c.fullName} · NIF ${c.nif}` : c.fullName, fullName: c.fullName, nif: c.nif }));
}

export async function vehicleOptions(includeSold = true) {
  const rows = await db
    .select({ id: schema.vehicles.id, make: schema.vehicles.make, model: schema.vehicles.model, plate: schema.vehicles.plate, status: schema.vehicles.status })
    .from(schema.vehicles)
    .where(includeSold ? undefined : ne(schema.vehicles.status, "sold"))
    .orderBy(desc(schema.vehicles.updatedAt))
    .limit(2000);
  return rows.map((v) => ({ id: v.id, label: `${v.make} ${v.model}${v.plate ? ` · ${formatPlate(v.plate)}` : ""}` }));
}

export async function formHistory(filter: { vehicleId?: string; customerId?: string; limit?: number }) {
  const templates = await getTemplates();
  const rows = await db
    .select({
      id: schema.generatedForms.id,
      template: schema.generatedForms.template,
      fileId: schema.generatedForms.fileId,
      createdAt: schema.generatedForms.createdAt,
      customer: schema.customers.fullName,
      make: schema.vehicles.make,
      model: schema.vehicles.model,
      plate: schema.vehicles.plate,
      by: schema.users.name,
    })
    .from(schema.generatedForms)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.generatedForms.customerId))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.generatedForms.vehicleId))
    .leftJoin(schema.users, eq(schema.users.id, schema.generatedForms.createdBy))
    .where(
      filter.vehicleId
        ? eq(schema.generatedForms.vehicleId, filter.vehicleId)
        : filter.customerId
          ? eq(schema.generatedForms.customerId, filter.customerId)
          : undefined,
    )
    .orderBy(desc(schema.generatedForms.createdAt))
    .limit(filter.limit ?? 50);
  return rows.map((r) => ({
    id: r.id,
    title: templates[r.template as keyof typeof templates]?.title ?? r.template,
    who: [r.customer, r.make ? `${r.make} ${r.model}${r.plate ? ` ${formatPlate(r.plate)}` : ""}` : null].filter(Boolean).join(" — "),
    createdAt: r.createdAt.toISOString(),
    fileId: r.fileId,
    by: r.by ?? "—",
  }));
}

export async function documentsFor(ownerType: "vehicle" | "customer", ownerId: string) {
  const rows = await db
    .select({ doc: schema.documents, file: schema.files })
    .from(schema.documents)
    .innerJoin(schema.files, eq(schema.files.id, schema.documents.fileId))
    .where(and(eq(schema.documents.ownerType, ownerType), eq(schema.documents.ownerId, ownerId)))
    .orderBy(desc(schema.documents.createdAt));
  return rows.map(({ doc, file }) => ({
    id: doc.id,
    kind: doc.kind,
    label: doc.label,
    fileId: doc.fileId,
    mime: file.mime,
    originalName: file.originalName,
    size: file.size,
    createdAt: doc.createdAt.toISOString(),
    expiresOn: doc.expiresOn,
    extractionStatus: doc.extractionStatus,
    summary: typeof doc.extracted?.summary === "string" ? doc.extracted.summary : null,
  }));
}

export async function entityHistory(entityType: string, entityId: string, limit = 100) {
  return db
    .select()
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.entityType, entityType), eq(schema.auditLogs.entityId, entityId)))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit);
}

export async function usersByIds(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}
