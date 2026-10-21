"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteVehicle } from "@/app/painel/_actions/vehicles";
import { Dialog, Spinner, useAction } from "./ui";

/** Botão "Excluir carro" (sempre visível na ficha): apaga o carro de tudo, com uma confirmação. */
export function DeleteVehicle({ id, label, back }: { id: string; label: string; back: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="a-btn a-btn-sm a-btn-danger" onClick={() => setOpen(true)}>
        <Trash2 size={14} /> Excluir carro
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Excluir ${label}`}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="a-btn a-btn-danger"
              disabled={pending}
              onClick={async () => {
                const res = await run(() => deleteVehicle(id, "APAGAR"));
                if (res.ok) router.push(back);
              }}
            >
              {pending ? <Spinner /> : <Trash2 size={16} />} Excluir definitivamente
            </button>
          </>
        }
      >
        <p>
          Apaga o carro de tudo: do site, do painel, as fotografias, os documentos, os custos e os alugueres. Não dá para desfazer.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Vendas a prestações deste carro ficam nas Cobranças (com os dados do carro escritos), só deixam de estar ligadas a ele.
        </p>
      </Dialog>
    </>
  );
}
