"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncPartnerStock } from "@/app/painel/_actions/partners";
import { Spinner, useAction } from "./ui";

/** Atualiza o stock a partir do site do parceiro (preços, km, vendidos, viaturas novas com fotografias). */
export function PartnerSync() {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      className="a-btn"
      disabled={pending}
      title="Copia preços, fotografias e descrições do site tampinhacars.pt"
      onClick={async () => {
        const res = await run(() => syncPartnerStock(), { quiet: true });
        if (res.ok) {
          window.alert(res.data.summary);
          router.refresh();
        }
      }}
    >
      {pending ? <Spinner /> : <RefreshCw size={16} />} {pending ? "A atualizar…" : "Atualizar da Tampinha Cars"}
    </button>
  );
}
