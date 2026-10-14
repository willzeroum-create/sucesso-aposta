"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteCustomer } from "@/app/painel/_actions/customers";
import { useAction } from "./ui";

export function DeleteCustomer({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <strong>Apagar ficha</strong>
        <p className="muted" style={{ fontSize: 13 }}>
          Remove os dados pessoais e os documentos do cliente (direito ao apagamento, RGPD).
        </p>
      </div>
      <button
        type="button"
        className="a-btn a-btn-danger"
        disabled={pending}
        onClick={async () => {
          if (!confirm(`Apagar a ficha de ${name} e todos os documentos? Esta ação não pode ser desfeita.`)) return;
          if ((await run(() => deleteCustomer(id))).ok) router.push("/painel/clientes");
        }}
      >
        <Trash2 size={16} /> Apagar ficha
      </button>
    </section>
  );
}
