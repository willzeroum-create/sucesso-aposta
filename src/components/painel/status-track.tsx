"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, GlobeLock } from "lucide-react";
import { setVehicleStatus } from "@/app/painel/_actions/vehicles";
import { VEHICLE_STATUS, type VehicleStatusKey } from "@/lib/labels";
import { Alert, Dialog, Spinner, useAction } from "./ui";

type Customer = { id: string; fullName: string; nif: string | null };

export function StatusTrack({
  vehicleId,
  status,
  published,
  canChange,
  gaps,
  customers,
  buyerId,
  price,
  soldPrice,
  onSite = true,
}: {
  vehicleId: string;
  status: VehicleStatusKey;
  published: boolean;
  canChange: boolean;
  gaps: string[];
  customers: Customer[];
  buyerId: string | null;
  price: number | null;
  soldPrice: number | null;
  /** Estoque e aluguer não vão para o site: sem botões de publicação. */
  onSite?: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [dialog, setDialog] = useState<null | "reserved" | "sold">(null);
  const [buyer, setBuyer] = useState(buyerId ?? "");
  const [salePrice, setSalePrice] = useState(String(soldPrice ?? price ?? ""));
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));

  async function change(next: VehicleStatusKey, extra: { buyerCustomerId?: string | null; soldPriceEur?: number | null; soldAt?: string | null } = {}) {
    const keepPublished = !onSite || next === "preparation" ? false : published || (status === "preparation" && gaps.length === 0);
    const res = await run(() => setVehicleStatus(vehicleId, { status: next, published: keepPublished, ...extra }));
    if (res.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  async function togglePublish() {
    const res = await run(() => setVehicleStatus(vehicleId, { status, published: !published }));
    if (res.ok) router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="a-track" role="group" aria-label="Estado da viatura">
        {(Object.keys(VEHICLE_STATUS) as VehicleStatusKey[]).map((s) => (
          <button
            key={s}
            type="button"
            className={s}
            aria-pressed={status === s}
            disabled={!canChange || pending || status === s}
            onClick={() => (s === "reserved" || s === "sold" ? setDialog(s) : change(s))}
          >
            <strong>{VEHICLE_STATUS[s].label}</strong>
            <small>{VEHICLE_STATUS[s].hint}</small>
          </button>
        ))}
      </div>
      {onSite && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {status === "preparation" ? (
          <span className="muted" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 14 }}>
            <GlobeLock size={16} /> Fora do site enquanto está em preparação.
          </span>
        ) : (
          <>
            <span className={`a-pill ${published ? "available" : "neutral"}`}>{published ? "Publicada no site" : "Não publicada"}</span>
            {canChange && (
              <button type="button" className="a-btn a-btn-sm" onClick={togglePublish} disabled={pending || (!published && gaps.length > 0)}>
                {pending ? <Spinner size={14} /> : <Globe size={15} />} {published ? "Retirar do site" : "Publicar no site"}
              </button>
            )}
          </>
        )}
        {gaps.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Para publicar falta: {gaps.join(", ")}.</span>}
      </div>
      )}

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "sold" ? "Marcar como vendida" : "Reservar viatura"}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setDialog(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="a-btn a-btn-primary"
              disabled={pending}
              onClick={() =>
                change(dialog!, {
                  buyerCustomerId: buyer || null,
                  ...(dialog === "sold" ? { soldPriceEur: salePrice ? Number(salePrice.replace(",", ".")) : null, soldAt: saleDate } : {}),
                })
              }
            >
              {pending && <Spinner />} {dialog === "sold" ? "Confirmar venda" : "Confirmar reserva"}
            </button>
          </>
        }
      >
        <div className="a-field">
          <label htmlFor="buyer">{dialog === "sold" ? "Comprador" : "Reservada para"}</label>
          <select id="buyer" value={buyer} onChange={(e) => setBuyer(e.target.value)}>
            <option value="">— Sem cliente associado —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName}
                {c.nif ? ` · NIF ${c.nif}` : ""}
              </option>
            ))}
          </select>
          <span className="a-hint">O cliente não está na lista? Crie a ficha em Clientes (pode ler o Cartão de Cidadão com IA).</span>
        </div>
        {dialog === "sold" && (
          <div className="a-fields">
            <div className="a-field">
              <label htmlFor="sale-price">Preço de venda final (€)</label>
              <input id="sale-price" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
            </div>
            <div className="a-field">
              <label htmlFor="sale-date">Data da venda</label>
              <input id="sale-date" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
          </div>
        )}
        {dialog === "sold" && published && <Alert kind="info">No site passa a aparecer como “Vendido” durante 30 dias.</Alert>}
      </Dialog>
    </div>
  );
}
