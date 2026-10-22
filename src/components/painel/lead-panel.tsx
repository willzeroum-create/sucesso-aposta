"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { addLeadNote, assignLead, convertLeadToCustomer, createManualLead, deleteLead, setLeadStatus } from "@/app/painel/_actions/leads";
import { LEAD_STATUS } from "@/lib/labels";
import { Dialog, Spinner, useAction } from "./ui";

export function LeadControls({
  id,
  status,
  assignedTo,
  users,
  customerId,
  canEdit,
  canConvert,
}: {
  id: string;
  status: keyof typeof LEAD_STATUS;
  assignedTo: string | null;
  users: { id: string; name: string }[];
  customerId: string | null;
  canEdit: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {canEdit && (
        <>
          <button type="button" className="a-btn a-btn-sm a-btn-danger" style={{ justifySelf: "start", order: 99 }} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> Apagar pedido
          </button>
          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Apagar pedido"
            footer={
              <>
                <button type="button" className="a-btn" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="a-btn a-btn-danger"
                  disabled={pending}
                  onClick={async () => {
                    if ((await run(() => deleteLead(id))).ok) router.push("/painel/crm");
                  }}
                >
                  {pending ? <Spinner /> : <Trash2 size={16} />} Apagar definitivamente
                </button>
              </>
            }
          >
            <p>Apaga o pedido e as notas dele. A ficha de cliente, se existir, fica.</p>
          </Dialog>
        </>
      )}
      <div className="a-field">
        <label htmlFor="lead-status">Fase</label>
        <select
          id="lead-status"
          value={status}
          disabled={!canEdit || pending}
          onChange={async (e) => (await run(() => setLeadStatus(id, e.target.value), { quiet: true })).ok && router.refresh()}
        >
          {Object.entries(LEAD_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="a-field">
        <label htmlFor="lead-assign">Responsável</label>
        <select
          id="lead-assign"
          value={assignedTo ?? ""}
          disabled={!canEdit || pending}
          onChange={async (e) => (await run(() => assignLead(id, e.target.value || null), { quiet: true })).ok && router.refresh()}
        >
          <option value="">— Ninguém —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      {customerId ? (
        <a href={`/painel/clientes/${customerId}`} className="a-btn">
          Abrir ficha de cliente
        </a>
      ) : (
        canConvert && (
          <button
            type="button"
            className="a-btn"
            disabled={pending}
            onClick={async () => {
              const res = await run(() => convertLeadToCustomer(id));
              if (res.ok) router.push(`/painel/clientes/${res.data.customerId}`);
            }}
          >
            <UserPlus size={16} /> Criar ficha de cliente
          </button>
        )
      )}
      {canEdit && (
        <form
          className="a-field"
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await run(() => addLeadNote(id, note));
            if (res.ok) {
              setNote("");
              router.refresh();
            }
          }}
        >
          <label htmlFor="lead-note">Nova nota</label>
          <textarea id="lead-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: Liguei, vem ver o carro sábado às 10h." maxLength={4000} />
          <div>
            <button className="a-btn a-btn-sm a-btn-primary" disabled={pending || !note.trim()}>
              {pending && <Spinner size={14} />} Adicionar nota
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function NewLeadButton({ vehicles }: { vehicles: { id: string; label: string }[] }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="a-btn a-btn-primary" onClick={() => setOpen(true)}>
        <Plus size={17} /> Registar pedido
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Registar pedido (telefone, presencial…)">
        <form
          id="manual-lead"
          className="a-form"
          style={{ gap: 14 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const res = await run(() => createManualLead(new FormData(e.currentTarget)));
            if (res.ok) {
              setOpen(false);
              router.push(`/painel/crm/${res.data.id}`);
            }
          }}
        >
          <div className="a-fields">
            <div className="a-field wide">
              <label htmlFor="ml-name">Nome</label>
              <input id="ml-name" name="fullName" required />
              {fields.fullName && <span className="a-error">{fields.fullName}</span>}
            </div>
            <div className="a-field">
              <label htmlFor="ml-phone">Telefone</label>
              <input id="ml-phone" name="phone" type="tel" />
              {fields.phone && <span className="a-error">{fields.phone}</span>}
            </div>
            <div className="a-field">
              <label htmlFor="ml-email">E-mail</label>
              <input id="ml-email" name="email" type="email" />
              {fields.email && <span className="a-error">{fields.email}</span>}
            </div>
            <div className="a-field">
              <label htmlFor="ml-source">Origem</label>
              <input id="ml-source" name="source" list="ml-sources" placeholder="Telefone" />
              <datalist id="ml-sources">
                {["Telefone", "Presencial", "WhatsApp", "Standvirtual", "OLX", "Facebook", "Instagram", "Recomendação"].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="a-field">
              <label htmlFor="ml-vehicle">Viatura</label>
              <select id="ml-vehicle" name="vehicleId" defaultValue="">
                <option value="">— Nenhuma —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="a-field wide">
              <label htmlFor="ml-msg">O que pretende</label>
              <textarea id="ml-msg" name="message" rows={3} required />
              {fields.message && <span className="a-error">{fields.message}</span>}
            </div>
          </div>
          <div className="a-actions">
            <button className="a-btn a-btn-primary" disabled={pending}>
              {pending && <Spinner />} Registar
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
