"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setVehicleSection } from "@/app/painel/_actions/vehicles";
import { SECTIONS, type SectionKey } from "@/lib/sections";
import { Spinner, useAction } from "./ui";

/** Em que secção do painel está a viatura (site, estoque ou aluguer) e mudar de secção. */
export function SectionMover({ vehicleId, section }: { vehicleId: string; section: SectionKey }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [value, setValue] = useState<SectionKey>(section);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 14 }}>
      <label htmlFor={`sec-${vehicleId}`} className="muted">
        Secção:
      </label>
      <select id={`sec-${vehicleId}`} className="a-input" style={{ width: "auto", minWidth: 180 }} value={value} onChange={(e) => setValue(e.target.value as SectionKey)}>
        {(Object.keys(SECTIONS) as SectionKey[]).map((k) => (
          <option key={k} value={k}>
            {SECTIONS[k].label}
          </option>
        ))}
      </select>
      {value !== section && (
        <button
          type="button"
          className="a-btn a-btn-sm a-btn-primary"
          disabled={pending}
          onClick={async () => {
            const res = await run(() => setVehicleSection(vehicleId, value));
            if (res.ok) router.push(`${res.data.base}/${vehicleId}`);
          }}
        >
          {pending ? <Spinner size={14} /> : null} Mover para {SECTIONS[value].short}
        </button>
      )}
      {value !== section && value !== "site" && <span className="muted" style={{ fontSize: 13 }}>Sai do site, se estiver publicada.</span>}
    </div>
  );
}
