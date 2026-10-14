import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { assertSameOrigin, jsonError, readFiles } from "@/server/http";
import { newId } from "@/server/ids";
import { storeVehiclePhoto } from "@/server/storage";
import { UserError } from "@/server/action";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST multipart (files[]) — fotografias convertidas para WebP e anexadas ao fim da galeria. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/vehicles/[id]/photos">) {
  try {
    assertSameOrigin(req);
    const user = await assertPermission("vehicles.edit");
    const { id } = await ctx.params;
    const [vehicle] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
    if (!vehicle) throw new UserError("Viatura não encontrada.");
    const files = await readFiles(await req.formData(), "files", 12);
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${schema.vehiclePhotos.position}), -1)` })
      .from(schema.vehiclePhotos)
      .where(eq(schema.vehiclePhotos.vehicleId, id));
    const created: { id: string; url: string }[] = [];
    let position = Number(max) + 1;
    for (const f of files) {
      const stored = await storeVehiclePhoto(f.buffer, f.name, user.id);
      const photoId = newId("pho");
      await db.insert(schema.vehiclePhotos).values({
        id: photoId,
        vehicleId: id,
        fileId: stored.id,
        alt: `${vehicle.make} ${vehicle.model} ${vehicle.version}`.trim(),
        position: position++,
      });
      created.push({ id: photoId, url: stored.url });
    }
    if (!vehicle.coverPhotoId && created[0])
      await db.update(schema.vehicles).set({ coverPhotoId: created[0].id }).where(eq(schema.vehicles.id, id));
    await audit(user, {
      action: "vehicle.photos_add",
      entityType: "vehicle",
      entityId: id,
      summary: `Carregou ${created.length} fotografia(s) de ${vehicle.make} ${vehicle.model}`,
    });
    revalidatePath(`/painel/viaturas/${id}`);
    if (vehicle.published) revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, photos: created });
  } catch (e) {
    return jsonError(e);
  }
}
