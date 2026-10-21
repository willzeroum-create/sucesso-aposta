"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Car, Check, MessageCircle, Search, X } from "lucide-react";
import { cancelRental, extendRental, returnRental } from "@/app/painel/_actions/rentals";
import { lisbonDateTime, lisbonParts, RENTAL_STATE_LABEL, type RentalState } from "@/lib/rentals";
import { SECTIONS } from "@/lib/sections";
import { whatsappLink } from "@/lib/cobrancas";
import type { RentalView } from "@/server/rentals";
import { Dialog, Field, Plate, Spinner, useAction } from "./ui";

const PILL: Record<RentalState, string> = {
  agendado: "neutral",
  a_decorrer: "available",
  termina_hoje: "reserved",
  atrasado: "danger",
  devolvido: "plain",
  cancelado: "neutral",
};
const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const int = new Intl.NumberFormat("pt-PT");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function stateText(r: RentalView): string {
  if (r.state === "atrasado") return `${r.stateDays} dia${r.stateDays === 1 ? "" : "s"} em atraso`;
  if (r.state === "a_decorrer") return `Faltam ${r.stateDays} dia${r.stateDays === 1 ? "" : "s"}`;
  if (r.state === "agendado") return `Começa daqui a ${r.stateDays} dia${r.stateDays === 1 ? "" : "s"}`;
  return RENTAL_STATE_LABEL[r.state];
}

/** Um aluguer: carro, cliente, período, km, valor e ações (devolução, prolongar, cancelar, WhatsApp). */
export function RentalRow({ r, canEdit, showVehicle = true }: { r: RentalView; canEdit: boolean; showVehicle?: boolean }) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [dialog, setDialog] = useState<null | "return" | "extend" | "cancel">(null);
  const now = lisbonParts(new Date());
  const end = lisbonParts(new Date(r.endAt));
  const [ret, setRet] = useState({ date: now.date, time: now.time, km: "", notes: "" });
  const [ext, setExt] = useState({ date: end.date, time: end.time, total: r.totalEur != null ? String(r.totalEur).replace(".", ",") : "" });
  const wa = whatsappLink(
    r.phone,
    r.state === "atrasado"
      ? `Olá ${r.customer.split(/\s+/)[0]}, tudo bem? O aluguer do ${r.vehicle} terminou a ${lisbonDateTime(new Date(r.endAt))}. Quando pode fazer a entrega? Obrigado!`
      : `Olá ${r.customer.split(/\s+/)[0]}, tudo bem? Lembramos que o aluguer do ${r.vehicle} termina a ${lisbonDateTime(new Date(r.endAt))}. Obrigado!`,
  );
  const close = (ok: boolean) => {
    if (ok) {
      setDialog(null);
      router.refresh();
    }
  };
  const money = (v: string) => Number(v.replace(/\s|€/g, "").replace(",", "."));

  return (
    <div className="a-rental">
      {showVehicle && (
        <Link href={`${SECTIONS[r.section].base}/${r.vehicleId}?tab=aluguer`} className="a-rental-photo" aria-label={`Abrir ${r.vehicle}`}>
          {r.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.photo} alt="" />
          ) : (
            <Car size={22} />
          )}
        </Link>
      )}
      <div className="a-rental-main">
        <div className="a-rental-top">
          {showVehicle && (
            <Link href={`${SECTIONS[r.section].base}/${r.vehicleId}?tab=aluguer`} style={{ color: "inherit" }}>
              <strong>{r.vehicle}</strong>
            </Link>
          )}
          {showVehicle && r.plate && <Plate value={r.plate} />}
          <span className={`a-pill ${PILL[r.state]}`}>{stateText(r)}</span>
        </div>
        <span>
          <Link href={`/painel/clientes/${r.customerId}`} style={{ color: "inherit", fontWeight: 600 }}>
            {r.customer}
          </Link>
          {r.phone ? <span className="muted"> · {r.phone}</span> : null}
        </span>
        <small className="muted">
          {lisbonDateTime(new Date(r.startAt))} → {lisbonDateTime(new Date(r.endAt))} · {r.days} dia{r.days === 1 ? "" : "s"}
          {r.returnedAt ? ` · devolvido a ${lisbonDateTime(new Date(r.returnedAt))}` : ""}
        </small>
        <small className="muted">
          {r.kmOut != null ? `Saída ${int.format(r.kmOut)} km` : "Km de saída por registar"}
          {r.kmIn != null ? ` · entrega ${int.format(r.kmIn)} km (${int.format(r.kmIn - (r.kmOut ?? r.kmIn))} km feitos)` : ""}
          {r.totalEur != null ? ` · ${eur.format(r.totalEur)}` : ""}
          {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
        </small>
        {r.status === "active" && (
          <div className="a-row-actions" style={{ justifyContent: "flex-start", marginTop: 4 }}>
            {canEdit && (
              <button type="button" className="a-btn a-btn-sm a-btn-primary" onClick={() => setDialog("return")}>
                <Check size={14} /> Registar devolução
              </button>
            )}
            {canEdit && (
              <button type="button" className="a-btn a-btn-sm" onClick={() => setDialog("extend")}>
                <CalendarClock size={14} /> Prolongar
              </button>
            )}
            {wa && (
              <a className="a-btn a-btn-sm" href={wa} target="_blank" rel="noopener">
                <MessageCircle size={14} /> WhatsApp
              </a>
            )}
            {canEdit && (
              <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setDialog("cancel")}>
                <X size={14} /> Cancelar
              </button>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={dialog === "return"}
        onClose={() => setDialog(null)}
        title={`Devolução · ${r.vehicle}`}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setDialog(null)}>
              Voltar
            </button>
            <button
              type="button"
              className="a-btn a-btn-primary"
              disabled={pending}
              onClick={async () =>
                close((await run(() => returnRental(r.id, { date: ret.date, time: ret.time, kmIn: ret.km ? Number(ret.km.replace(/\D/g, "")) : null, notes: ret.notes }))).ok)
              }
            >
              {pending ? <Spinner /> : <Check size={16} />} Confirmar devolução
            </button>
          </>
        }
      >
        <div className="a-fields">
          <Field label="Data" name={`ret-date-${r.id}`}>
            <input id={`f-ret-date-${r.id}`} type="date" value={ret.date} onChange={(e) => setRet((x) => ({ ...x, date: e.target.value }))} />
          </Field>
          <Field label="Hora" name={`ret-time-${r.id}`}>
            <input id={`f-ret-time-${r.id}`} type="time" value={ret.time} onChange={(e) => setRet((x) => ({ ...x, time: e.target.value }))} />
          </Field>
          <Field label="Km na entrega" name={`ret-km-${r.id}`} error={errors.kmIn} hint={r.kmOut != null ? `Saiu com ${int.format(r.kmOut)} km.` : undefined}>
            <input id={`f-ret-km-${r.id}`} inputMode="numeric" value={ret.km} onChange={(e) => setRet((x) => ({ ...x, km: e.target.value }))} />
          </Field>
          <Field label="Observações (estado, danos, combustível…)" name={`ret-notes-${r.id}`} wide>
            <textarea id={`f-ret-notes-${r.id}`} rows={2} value={ret.notes} onChange={(e) => setRet((x) => ({ ...x, notes: e.target.value }))} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "extend"}
        onClose={() => setDialog(null)}
        title={`Prolongar · ${r.vehicle}`}
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setDialog(null)}>
              Voltar
            </button>
            <button
              type="button"
              className="a-btn a-btn-primary"
              disabled={pending}
              onClick={async () => close((await run(() => extendRental(r.id, { date: ext.date, time: ext.time, totalEur: ext.total ? money(ext.total) : null }))).ok)}
            >
              {pending ? <Spinner /> : <Check size={16} />} Guardar
            </button>
          </>
        }
      >
        <div className="a-fields">
          <Field label="Novo fim (data)" name={`ext-date-${r.id}`} error={errors.endDate}>
            <input id={`f-ext-date-${r.id}`} type="date" value={ext.date} onChange={(e) => setExt((x) => ({ ...x, date: e.target.value }))} />
          </Field>
          <Field label="Hora" name={`ext-time-${r.id}`}>
            <input id={`f-ext-time-${r.id}`} type="time" value={ext.time} onChange={(e) => setExt((x) => ({ ...x, time: e.target.value }))} />
          </Field>
          <Field label="Valor total (€)" name={`ext-total-${r.id}`} hint="O total do aluguer com os dias a mais.">
            <input id={`f-ext-total-${r.id}`} inputMode="decimal" value={ext.total} onChange={(e) => setExt((x) => ({ ...x, total: e.target.value }))} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="Cancelar aluguer"
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setDialog(null)}>
              Voltar
            </button>
            <button type="button" className="a-btn a-btn-danger" disabled={pending} onClick={async () => close((await run(() => cancelRental(r.id))).ok)}>
              Cancelar aluguer
            </button>
          </>
        }
      >
        <p>Para um aluguer registado por engano ou que não chegou a acontecer. Fica no histórico como cancelado.</p>
      </Dialog>
    </div>
  );
}

/** Alugueres de uma viatura (separador Aluguer da ficha). */
export function RentalsCard({ rentals, canEdit }: { rentals: RentalView[]; canEdit: boolean }) {
  if (!rentals.length) return null;
  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Alugueres desta viatura</h2>
        </div>
        <span className="a-pill plain">{rentals.length}</span>
      </div>
      <div className="a-docs">
        {rentals.map((r) => (
          <RentalRow key={r.id} r={r} canEdit={canEdit} showVehicle={false} />
        ))}
      </div>
    </section>
  );
}

/** Histórico com pesquisa (cliente, carro, matrícula). */
export function RentalHistory({ rentals }: { rentals: RentalView[] }) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const shown = q ? rentals.filter((r) => fold(`${r.customer} ${r.vehicle} ${r.plate}`).includes(q)) : rentals;
  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Histórico de alugueres</h2>
          <p>Devolvidos e cancelados</p>
        </div>
      </div>
      {rentals.length > 0 && (
        <div className="a-card-body" style={{ paddingBottom: 0 }}>
          <div className="a-search" style={{ maxWidth: "none" }} role="search">
            <Search size={16} aria-hidden="true" />
            <input className="a-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por cliente, carro ou matrícula" aria-label="Procurar no histórico" />
          </div>
        </div>
      )}
      {shown.length ? (
        <div className="a-docs" style={{ marginTop: 12 }}>
          {shown.map((r) => (
            <RentalRow key={r.id} r={r} canEdit={false} />
          ))}
        </div>
      ) : (
        <div className="a-empty">
          <strong>{rentals.length ? `Nada encontrado com «${query.trim()}».` : "Ainda não há alugueres fechados."}</strong>
        </div>
      )}
    </section>
  );
}
