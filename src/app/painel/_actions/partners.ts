"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { PARTNER_LABEL, syncTampinha } from "@/server/partners/tampinha";
import { run } from "@/server/action";

/** Botão "Atualizar da Tampinha Cars": preços, km, vendidos e viaturas novas (com fotografias). */
export async function syncPartnerStock(): Promise<ActionResult<{ summary: string; pending: number }>> {
  return run(async () => {
    const user = await assertPermission("vehicles.edit");
    await assertPermission("vehicles.status");
    // Cabe num pedido: o que faltar (fotografias de muitas viaturas novas) faz-se no clique seguinte.
    const r = await syncTampinha({ userId: user.id, deadline: Date.now() + 45_000 });
    const parts = [
      `${r.listed} anúncios`,
      r.created && `${r.created} novas`,
      r.updated && `${r.updated} atualizadas`,
      r.linked && `${r.linked} ligadas`,
      r.unpublished && `${r.unpublished} retiradas do site`,
      r.photos && `${r.photos} fotografias`,
    ].filter(Boolean);
    const summary = `${PARTNER_LABEL}: ${parts.join(" · ")}.`;
    await audit(user, { action: "vehicle.partner_sync", entityType: "vehicle", entityId: null, summary });
    revalidatePath("/painel/viaturas");
    revalidatePath("/", "layout");
    return { summary: r.pendingPhotos ? `${summary} Falta terminar ${r.pendingPhotos}: carregue de novo.` : summary, pending: r.pendingPhotos };
  });
}
