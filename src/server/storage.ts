/**
 * Armazenamento de ficheiros.
 *  - local (predefinido): ./data/uploads/{public|private}/… — desenvolvimento e servidores com disco persistente.
 *  - blob: Vercel Blob (BLOB_READ_WRITE_TOKEN) — obrigatório em serverless, onde o disco não persiste.
 * Os ficheiros são sempre servidos pela aplicação (/media/… públicos, /api/admin/files/… privados com sessão),
 * por isso a URL pública nunca revela o fornecedor nem permite listar documentos.
 */
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OutputInfo } from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./ids";

type Visibility = "public" | "private";

const ROOT = process.env.UPLOADS_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "data", "uploads");
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function storageDriver(): "local" | "blob" {
  return process.env.STORAGE_DRIVER === "blob" || (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN) ? "blob" : "local";
}

/** Assinaturas (magic bytes): o tipo declarado pelo navegador não é confiável. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (/heic|heix|hevc|mif1|msf1/.test(brand)) return "image/heic";
    if (/avif/.test(brand)) return "image/avif";
  }
  if (buf.subarray(0, 6).toString("ascii").startsWith("GIF8")) return "image/gif";
  return null;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "image/gif": "gif",
  "image/heic": "heic", "image/avif": "avif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

async function putObject(key: string, body: Buffer, mime: string): Promise<void> {
  if (storageDriver() === "blob") {
    const { put } = await import("@vercel/blob");
    // Loja privada: tudo (fotos incluídas) é servido pela aplicação, nunca por URL direta do Blob.
    await put(key, body, { access: "private", contentType: mime, addRandomSuffix: false, allowOverwrite: false });
    return;
  }
  const file = path.join(ROOT, key);
  if (!file.startsWith(ROOT + path.sep)) throw new Error("Caminho inválido.");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body, { flag: "wx" });
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (storageDriver() === "blob") {
    const { get } = await import("@vercel/blob");
    try {
      const res = await get(key, { access: "private" });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      return Buffer.from(await new Response(res.stream).arrayBuffer());
    } catch {
      return null;
    }
  }
  const file = path.join(ROOT, key);
  if (!file.startsWith(ROOT + path.sep)) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (storageDriver() === "blob") {
    const { del } = await import("@vercel/blob");
    await del(key).catch(() => {});
    return;
  }
  const file = path.join(ROOT, key);
  if (file.startsWith(ROOT + path.sep)) await rm(file, { force: true });
}

export interface StoredFile {
  id: string;
  storageKey: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
}

export function publicUrl(storageKey: string): string {
  return `/media/${storageKey.replace(/^public\//, "")}`;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Fotografia pública de viatura: valida, corrige orientação, remove EXIF/GPS, converte para WebP
 * (até 2400 px) e grava. O original não é mantido — só a versão publicável.
 */
export async function storeVehiclePhoto(input: Buffer, originalName: string, userId: string): Promise<StoredFile> {
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError("Fotografia demasiado grande (máx. 20 MB).");
  const sniffed = sniffMime(input);
  if (!sniffed || !sniffed.startsWith("image/")) throw new UploadError(`${originalName}: não é uma imagem suportada.`);
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(input, { failOn: "error", limitInputPixels: 80_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new UploadError(`${originalName}: não foi possível ler a imagem (HEIC do iPhone? exporte em JPG).`);
  }
  return saveRecord(out.data, "image/webp", "public", originalName, userId, out.info.width, out.info.height);
}

/** Documento privado (foto ou PDF), guardado tal como foi enviado. */
export async function storePrivateDocument(input: Buffer, originalName: string, userId: string): Promise<StoredFile> {
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError("Ficheiro demasiado grande (máx. 20 MB).");
  const mime = sniffMime(input);
  if (!mime) throw new UploadError(`${originalName}: formato não suportado. Envie PDF, JPG, PNG, WebP ou HEIC.`);
  return saveRecord(input, mime, "private", originalName, userId, null, null);
}

/** Modelo Word do stand (validado em docx-template.ts antes de chegar aqui). */
export async function storeTemplateFile(input: Buffer, originalName: string, userId: string): Promise<StoredFile> {
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError("Ficheiro demasiado grande (máx. 20 MB).");
  return saveRecord(input, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "private", originalName, userId, null, null);
}

/** Ficheiro gerado pelo sistema (ex.: termo em PDF). */
export async function storeGenerated(input: Buffer, mime: string, name: string, userId: string): Promise<StoredFile> {
  return saveRecord(input, mime, "private", name, userId, null, null);
}

async function saveRecord(
  data: Buffer,
  mime: string,
  visibility: Visibility,
  originalName: string,
  userId: string,
  width: number | null,
  height: number | null,
): Promise<StoredFile> {
  const id = newId("file");
  const day = new Date().toISOString().slice(0, 7);
  const storageKey = `${visibility}/${day}/${id}-${randomBytes(6).toString("hex")}.${EXT[mime] ?? "bin"}`;
  await putObject(storageKey, data, mime);
  await db.insert(schema.files).values({
    id,
    storageKey,
    visibility,
    mime,
    size: data.length,
    width,
    height,
    originalName: originalName.slice(0, 200),
    sha256: createHash("sha256").update(data).digest("hex"),
    uploadedBy: userId,
  });
  return { id, storageKey, mime, size: data.length, width, height, url: visibility === "public" ? publicUrl(storageKey) : `/api/admin/files/${id}` };
}

export async function removeFile(fileId: string): Promise<void> {
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
  if (!row) return;
  await db.delete(schema.files).where(eq(schema.files.id, fileId));
  await deleteObject(row.storageKey);
}
