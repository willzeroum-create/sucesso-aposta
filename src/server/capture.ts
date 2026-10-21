/**
 * Fotografar com o telemóvel a partir do computador. O computador cria uma sessão curta e mostra um código QR
 * com um link de uso único; o telemóvel abre o link (sem login), fotografa e envia; o computador vai buscando
 * os ficheiros que chegam. O token só existe no link — na base de dados fica o SHA-256.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { DOCUMENT_KINDS } from "@/lib/document-kinds";
import { audit } from "./audit";
import { assertPermission, type SessionUser } from "./auth/session";
import { newId } from "./ids";
import { storePrivateDocument, storeVehiclePhoto } from "./storage";
import { UserError } from "./action";

export const CAPTURE_MINUTES = 15;
export const CAPTURE_MAX_FILES = 20;

export type CaptureTarget = { ownerType: "vehicle" | "customer" | "none" | "photos"; ownerId?: string; kind?: string };
type CaptureRow = typeof schema.captureSessions.$inferSelect;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createCaptureSession(target: CaptureTarget): Promise<{ id: string; token: string; expiresAt: Date }> {
  let user: SessionUser;
  if (target.ownerType === "photos") user = await assertPermission("vehicles.edit");
  else {
    user = await assertPermission("documents.upload");
    if (target.ownerType === "customer") await assertPermission("customers.edit");
  }
  // Fotografias sem viatura = formulário "Dar entrada" (a viatura ainda não existe; liga-se ao gravar).
  if (target.ownerType !== "none" && !(target.ownerType === "photos" && !target.ownerId)) {
    if (!target.ownerId) throw new UserError("Destino inválido.");
    const table = target.ownerType === "customer" ? schema.customers : schema.vehicles;
    const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, target.ownerId)).limit(1);
    if (!row) throw new UserError(target.ownerType === "customer" ? "Cliente não encontrado." : "Viatura não encontrada.");
  }
  const token = randomBytes(24).toString("base64url");
  const id = newId("cap");
  const expiresAt = new Date(Date.now() + CAPTURE_MINUTES * 60_000);
  await db.insert(schema.captureSessions).values({
    id,
    tokenHash: hash(token),
    userId: user.id,
    ownerType: target.ownerType,
    ownerId: target.ownerType === "none" ? null : (target.ownerId ?? null),
    kind: target.kind && target.kind in DOCUMENT_KINDS ? target.kind : "outro",
    expiresAt,
  });
  return { id, token, expiresAt };
}

/** Sessão válida (não expirada) a partir do token do link; null se não existir ou já tiver expirado. */
export async function captureByToken(token: string): Promise<CaptureRow | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(schema.captureSessions)
    .where(and(eq(schema.captureSessions.tokenHash, hash(token)), gt(schema.captureSessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function captureForUser(id: string, userId: string): Promise<CaptureRow | null> {
  const [row] = await db.select().from(schema.captureSessions).where(and(eq(schema.captureSessions.id, id), eq(schema.captureSessions.userId, userId))).limit(1);
  return row ?? null;
}

/** Guarda uma fotografia vinda do telemóvel no destino da sessão, em nome de quem abriu o código QR. */
export async function storeCaptured(session: CaptureRow, file: { name: string; buffer: Buffer }): Promise<string> {
  if (session.fileIds.length >= CAPTURE_MAX_FILES) throw new UserError(`No máximo ${CAPTURE_MAX_FILES} fotografias por código. Gere outro no computador.`);
  let fileId: string;
  if (session.ownerType === "photos" && !session.ownerId) {
    fileId = (await storeVehiclePhoto(file.buffer, file.name, session.userId)).id;
  } else if (session.ownerType === "photos") {
    const [vehicle] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, session.ownerId!)).limit(1);
    if (!vehicle) throw new UserError("Viatura não encontrada.");
    const stored = await storeVehiclePhoto(file.buffer, file.name, session.userId);
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${schema.vehiclePhotos.position}), -1)` })
      .from(schema.vehiclePhotos)
      .where(eq(schema.vehiclePhotos.vehicleId, vehicle.id));
    const photoId = newId("pho");
    await db.insert(schema.vehiclePhotos).values({ id: photoId, vehicleId: vehicle.id, fileId: stored.id, alt: `${vehicle.make} ${vehicle.model} ${vehicle.version}`.trim(), position: Number(max) + 1 });
    if (!vehicle.coverPhotoId) await db.update(schema.vehicles).set({ coverPhotoId: photoId }).where(eq(schema.vehicles.id, vehicle.id));
    fileId = stored.id;
  } else {
    const stored = await storePrivateDocument(file.buffer, file.name, session.userId);
    if (session.ownerType !== "none")
      await db.insert(schema.documents).values({
        id: newId("doc"),
        ownerType: session.ownerType,
        ownerId: session.ownerId!,
        kind: session.kind,
        label: DOCUMENT_KINDS[session.kind as keyof typeof DOCUMENT_KINDS] ?? DOCUMENT_KINDS.outro,
        fileId: stored.id,
        uploadedBy: session.userId,
      });
    fileId = stored.id;
  }
  await db
    .update(schema.captureSessions)
    .set({ fileIds: [...session.fileIds, fileId] })
    .where(eq(schema.captureSessions.id, session.id));
  session.fileIds.push(fileId);
  if (session.ownerType !== "none" && session.ownerId) {
    const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
    await audit({ id: session.userId, name: `${u?.name ?? "Equipa"} (telemóvel)` }, {
      action: session.ownerType === "photos" ? "vehicle.photos_add" : "document.upload",
      entityType: session.ownerType === "customer" ? "customer" : "vehicle",
      entityId: session.ownerId,
      summary: session.ownerType === "photos" ? "Carregou 1 fotografia pelo telemóvel (código QR)" : "Carregou 1 documento pelo telemóvel (código QR)",
    });
  }
  return fileId;
}
