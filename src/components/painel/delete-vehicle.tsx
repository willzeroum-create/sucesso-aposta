"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteVehicle } from "@/app/painel/_actions/vehicles";
import { Dialog, Spinner, useAction } from "./ui";

export function DeleteVehicle({ id }: { id: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <strong>Apagar viatura</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          Remove a viatura, as fotografias e os documentos. Fica registado na atividade.
        </p>
      </div>
      <button type="button" className="a-btn a-btn-danger" onClick={() => setOpen(true)}>
        <Trash2 size={16} /> Apagar
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Apagar viatura"
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="a-btn a-btn-danger"
              disabled={pending || text.trim().toUpperCase() !== "APAGAR"}
              onClick={async () => {
                const res = await run(() => deleteVehicle(id, text));
                if (res.ok) router.push("/painel/viaturas");
              }}
            >
              {pending && <Spinner />} Apagar definitivamente
            </button>
          </>
        }
      >
        <p>Esta ação não pode ser desfeita. Escreva APAGAR para confirmar.</p>
        <input className="a-input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Confirmação" autoFocus />
      </Dialog>
    </section>
  );
}
