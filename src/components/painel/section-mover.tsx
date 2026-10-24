"use client";

import { useRouter } from "next/navigation";
import { setVehicleSection } from "@/app/painel/_actions/vehicles";
import { DESTINATIONS, SECTIONS, type SectionKey } from "@/lib/sections";
import { Spinner, useAction } from "./ui";

/**
 * Destino do carro, com um toque: Venda (vai para o site), Aluguer ou Só estoque (não vai para o site).
 * Sair da Venda tira o carro do site.
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

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0, flex: "1 1 320px" }}>
      <span style={{ fontWeight: 600, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
        Destino do carro {pending && <Spinner size={14} />}
      </span>
      <div className="a-dest" role="group" aria-label="Destino do carro">
        {DESTINATIONS.map((d) => (
          <button key={d.key} type="button" className="a-dest-option" aria-pressed={section === d.key} disabled={pending} onClick={() => move(d.key)}>
            <strong>{d.label}</strong>
            <small>{d.hint}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
