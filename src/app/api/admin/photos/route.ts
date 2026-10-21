import { NextResponse } from "next/server";
import { assertPermission } from "@/server/auth/session";
import { assertSameOrigin, jsonError, readFiles } from "@/server/http";
import { storeVehiclePhoto } from "@/server/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST multipart (files[]) — fotografias de uma viatura que ainda não foi gravada (formulário "Dar entrada").
 * Ficam guardadas em WebP; ao gravar a viatura, createVehicle liga-as à galeria pela ordem enviada.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("vehicles.edit");
    const files = await readFiles(await req.formData(), "files", 12);
    const stored: { id: string; url: string }[] = [];
    for (const f of files) {
      const s = await storeVehiclePhoto(f.buffer, f.name, user.id);
      stored.push({ id: s.id, url: s.url });
    }
    return NextResponse.json({ ok: true, files: stored });
  } catch (e) {
    return jsonError(e);
  }
}
