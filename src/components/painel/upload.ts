"use client";

/**
 * Reduz fotografias grandes no navegador antes de enviar (limite de 4,5 MB por pedido na Vercel
 * e telemóveis com fotos de 8–15 MB). PDFs e formatos que o navegador não lê seguem intactos.
 */
export async function shrinkImage(file: File, maxSide = 2400, maxBytes = 3 * 1024 * 1024): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= maxBytes || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // ex.: HEIC em navegadores sem suporte — o servidor explica o erro
  }
}

export type AiReadMode = "vehicle" | "person" | "import" | "requester" | "parties" | "carphoto" | "declaration" | "customs" | "registo";

export interface UploadedDoc {
  fileId: string;
  documentId: string | null;
  name: string;
  mime: string;
}

async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as ({ ok: boolean; error?: string } & T) | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? (res.status === 413 ? "Ficheiro demasiado grande." : "Falha no envio. Tente de novo."));
  return json;
}

/** Fotografias de uma viatura ainda por gravar: devolve os ficheiros (id + endereço) pela ordem enviada. */
export async function uploadLoosePhotos(files: File[], onProgress?: (done: number, total: number) => void): Promise<{ id: string; url: string }[]> {
  const out: { id: string; url: string }[] = [];
  for (const [i, original] of files.entries()) {
    const file = await shrinkImage(original);
    const form = new FormData();
    form.append("files", file, file.name);
    const res = await postForm<{ files: { id: string; url: string }[] }>("/api/admin/photos", form);
    out.push(...res.files);
    onProgress?.(i + 1, files.length);
  }
  return out;
}

/** Envia um ficheiro de cada vez (respeita limites de tamanho por pedido e dá progresso real). */
export async function uploadDocuments(
  files: File[],
  target: { ownerType: "vehicle" | "customer" | "none"; ownerId?: string; kind?: string },
  onProgress?: (done: number, total: number) => void,
): Promise<UploadedDoc[]> {
  const out: UploadedDoc[] = [];
  for (const [i, original] of files.entries()) {
    const file = await shrinkImage(original);
    const form = new FormData();
    form.set("ownerType", target.ownerType);
    if (target.ownerId) form.set("ownerId", target.ownerId);
    form.set("kind", target.kind ?? "outro");
    form.append("files", file, file.name);
    const res = await postForm<{ files: UploadedDoc[] }>("/api/admin/documents", form);
    out.push(...res.files);
    onProgress?.(i + 1, files.length);
  }
  return out;
}

export async function uploadPhotos(vehicleId: string, files: File[], onProgress?: (done: number, total: number) => void): Promise<number> {
  let n = 0;
  for (const [i, original] of files.entries()) {
    const file = await shrinkImage(original);
    const form = new FormData();
    form.append("files", file, file.name);
    await postForm(`/api/admin/vehicles/${vehicleId}/photos`, form);
    n++;
    onProgress?.(i + 1, files.length);
  }
  return n;
}

export async function readWithAi<P>(mode: AiReadMode, fileIds: string[]): Promise<{ proposal: P; model: string | null }> {
  const res = await fetch("/api/admin/ai/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, fileIds }),
  });
  const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string; proposal: P; model: string | null } | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "A leitura falhou. Tente de novo.");
  return { proposal: json.proposal, model: json.model };
}
