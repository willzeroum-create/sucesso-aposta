"use client";

import { useRouter } from "next/navigation";
import { setVehicleSection } from "@/app/painel/_actions/vehicles";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { Spinner, useAction } from "./ui";

/**
 * Função do carro: no Estoque escolhe-se "Venda" ou "Aluguer" com um toque.
 * Também permite passar um carro do Estoque para as viaturas do site e vice-versa.
 */
export function SectionMover({ vehicleId, section }: { vehicleId: string; section: SectionKey }) {
  const router = useRouter();
  const { pending, run } = useAction();

  async function move(to: SectionKey) {
    if (to === section) return;
    const res = await run(() => setVehicleSection(vehicleId, to));
    if (!res.ok) return;
    if (SECTIONS[to].base === SECTIONS[section].base) router.refresh();
    else router.push(`${res.data.base}/${vehicleId}`);
  }

  if (section === "site")
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 14 }}>
        <span className="muted">Está nas viaturas do site.</span>
        <button type="button" className="a-btn a-btn-sm" disabled={pending} onClick={() => move("estoque")}>
          {pending ? <Spinner size={14} /> : null} Passar para o Estoque
        </button>
      </div>
    );

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 14 }}>
      <span style={{ fontWeight: 600 }}>Função:</span>
      <div className="a-seg" role="group" aria-label="Função do carro no estoque">
        <button type="button" aria-pressed={section === "estoque"} disabled={pending} onClick={() => move("estoque")}>
          Venda
        </button>
        <button type="button" aria-pressed={section === "aluguer"} disabled={pending} onClick={() => move("aluguer")}>
          Aluguer
        </button>
      </div>
      {pending && <Spinner size={14} />}
      <button type="button" className="a-btn a-btn-sm a-btn-ghost" disabled={pending} onClick={() => move("site")}>
        Pôr nas viaturas do site
      </button>
    </div>
  );
}
