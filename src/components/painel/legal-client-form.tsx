"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Save, Trash2, User } from "lucide-react";
import { createLegalClient, deleteLegalClient, updateLegalClient } from "@/app/painel/_actions/legal-clients";
import { emptyClient, type LegalClientData } from "@/lib/legalizacao";
import { REQUESTER_FIELDS } from "@/lib/modelo9";
import { AiReader, type FieldMeta } from "./ai-reader";
import { Dialog, Field, Spinner, useAction } from "./ui";

const META: FieldMeta[] = [{ key: "kind", label: "Tipo" }, ...REQUESTER_FIELDS.map((f) => ({ key: f.key, label: f.label, important: f.required }))];

/** Ficha do cliente da legalização (empresa ou particular): criar ou editar, com leitura da certidão/CC por fotografia. */
export function LegalClientForm({ client, cars = 0 }: { client?: { id: string; data: LegalClientData }; cars?: number }) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [data, setData] = useState<LegalClientData>(client?.data ?? emptyClient());
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof LegalClientData, v: string) => {
    setData((d) => ({ ...d, [k]: v }));
    setSuggested((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  };
  const fields = REQUESTER_FIELDS.filter((f) => (data.kind === "empresa" ? f.key !== "docNumber" : f.key !== "certCode"));

  async function save() {
    if (client) {
      const res = await run(() => updateLegalClient(client.id, data));
      if (res.ok) router.refresh();
      return;
    }
    const res = await run(() => createLegalClient(data));
    if (res.ok) router.push(`/painel/legalizacao/clientes/${res.data.id}`);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <AiReader
        mode="requester"
        target={{ ownerType: "none", kind: "identificacao" }}
        fields={META}
        current={{ ...(data as unknown as Record<string, string>), kind: "" }}
        onApply={(found) => {
          setData((d) => ({ ...d, ...found }) as LegalClientData);
          setSuggested((s) => new Set([...s, ...Object.keys(found)]));
        }}
        title={client ? "Atualizar com documentos" : "Preencher com documentos"}
        idSuffix="-cliente"
        intro="Empresa: certidão permanente ou cartão da empresa. Particular: Cartão de Cidadão (frente e verso) e comprovativo de morada."
      />
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>{client ? "Dados do cliente" : "Novo cliente"}</h2>
            <p>Em nome de quem os carros ficam registados. Estes dados vão para o Modelo 9 e para a DAV.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          <div className="a-tabs" role="radiogroup" aria-label="Tipo de cliente" style={{ border: 0 }}>
            <button type="button" role="radio" aria-checked={data.kind === "empresa"} aria-selected={data.kind === "empresa"} onClick={() => set("kind", "empresa")}>
              <Building2 size={15} /> Empresa
            </button>
            <button type="button" role="radio" aria-checked={data.kind === "particular"} aria-selected={data.kind === "particular"} onClick={() => set("kind", "particular")}>
              <User size={15} /> Particular
            </button>
          </div>
          <div className="a-fields">
            {fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} name={`lc-${f.key}`} wide={f.wide} suggested={suggested.has(f.key)} error={errors[f.key]}>
                <input
                  id={`f-lc-${f.key}`}
                  type={f.type ?? "text"}
                  inputMode={f.numeric ? "numeric" : undefined}
                  value={data[f.key as keyof LegalClientData] ?? ""}
                  onChange={(e) => set(f.key as keyof LegalClientData, e.target.value)}
                  placeholder={f.key === "postalCode" ? "0000-000" : f.key === "certCode" ? "0000-0000-0000" : undefined}
                />
              </Field>
            ))}
            <Field label="Notas" name="lc-notes" wide>
              <textarea id="f-lc-notes" rows={2} value={data.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="a-form-foot" style={{ margin: 0 }}>
          <button type="button" className="a-btn a-btn-primary" onClick={save} disabled={pending || data.name.trim().length < 2}>
            {pending ? <Spinner /> : <Save size={16} />} {client ? "Guardar" : "Criar cliente"}
          </button>
          {client && (
            <button type="button" className="a-btn a-btn-ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Apagar cliente
            </button>
          )}
        </div>
      </section>
      {client && (
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Apagar cliente"
          footer={
            <>
              <button type="button" className="a-btn" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="a-btn a-btn-danger"
                disabled={pending || cars > 0}
                onClick={async () => {
                  const res = await run(() => deleteLegalClient(client.id));
                  if (res.ok) router.push("/painel/legalizacao/clientes");
                }}
              >
                Apagar
              </button>
            </>
          }
        >
          <p>{cars > 0 ? `Este cliente tem ${cars} carro${cars === 1 ? "" : "s"} na legalização. Apague ou passe esses carros para outro cliente primeiro.` : `Apagar ${data.name}?`}</p>
        </Dialog>
      )}
    </div>
  );
}
