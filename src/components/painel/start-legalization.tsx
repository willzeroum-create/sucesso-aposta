"use client";

import { useRouter } from "next/navigation";
import { Stamp } from "lucide-react";
import { startVehicleLegalization } from "@/app/painel/_actions/legalizations";
import { Spinner, useAction } from "./ui";

/** Ficha do carro: abre a legalização com os dados e documentos do carro. */
export function StartLegalization({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      className="a-btn a-btn-sm"
      disabled={pending}
      onClick={async (e) => {
        e.preventDefault();
        const res = await run(() => startVehicleLegalization(vehicleId));
        if (res.ok) router.push(`/painel/legalizacao/${res.data.id}`);
      }}
    >
      {pending ? <Spinner size={14} /> : <Stamp size={14} />} Começar legalização
    </button>
  );
}
