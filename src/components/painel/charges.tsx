"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  addInstallments,
  addPayment,
  createChargeContract,
  deleteChargeContract,
  deleteInstallment,
  deletePayment,
  payInstallment,
  undoInstallment,
  updateChargeContract,
} from "@/app/painel/_actions/cobrancas";
import {
  buildPlan,
  chargeMessage,
  DEFAULT_CHARGE_MESSAGE,
  INSTALLMENT_STATUS_LABEL,
  PAYMENT_METHODS,
  toCents,
  toEuros,
  whatsappLink,
  type Contract,
  type Installment,
  type InstallmentStatus,
  type PaymentMethod,
} from "@/lib/cobrancas";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

export const money = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
export const datePt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const parseMoney = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
const PILL: Record<InstallmentStatus, string> = { paga: "available", parcial: "reserved", pendente: "neutral", hoje: "reserved", atrasada: "danger" };

export function InstallmentPill({ status, daysLate }: { status: InstallmentStatus; daysLate: number }) {
  return <span className={`a-pill ${PILL[status]}`}>{status === "atrasada" ? `${daysLate} dia${daysLate === 1 ? "" : "s"} em atraso` : INSTALLMENT_STATUS_LABEL[status]}</span>;
}

/** Botões de uma prestação em aberto: marcar como recebida e cobrar pelo WhatsApp. */
export function InstallmentActions({
  installment,
  customer,
  vehicle,
}: {
  installment: Pick<Installment, "id" | "status" | "open" | "dueDate" | "daysLate">;
  customer: { name: string; phone: string };
  vehicle: string;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState({ amount: String(installment.open).replace(".", ","), date: new Date().toISOString().slice(0, 10), method: "dinheiro" as PaymentMethod });
  const wa = whatsappLink(customer.phone, chargeMessage(DEFAULT_CHARGE_MESSAGE, { name: customer.name, amount: installment.open, dueDate: installment.dueDate, vehicle, daysLate: installment.daysLate }));
  if (installment.status === "paga")
    return (
      <div className="a-row-actions">
        <button type="button" className="a-btn a-btn-sm a-btn-ghost" disabled={pending} onClick={async () => (await run(() => undoInstallment(installment.id))).ok && router.refresh()}>
          <RotateCcw size={14} /> Desfazer
        </button>
      </div>
    );
  return (
    <div className="a-row-actions">
      <button type="button" className="a-btn a-btn-sm a-btn-primary" onClick={() => setOpen(true)}>
        <Check size={14} /> Recebido
      </button>
      {wa ? (
        <a className="a-btn a-btn-sm" href={wa} target="_blank" rel="noopener">
          <MessageCircle size={14} /> WhatsApp
        </a>
      ) : (
        <button type="button" className="a-btn a-btn-sm" disabled title="O cliente não tem telefone">
          <MessageCircle size={14} /> WhatsApp
        </button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Registar recebimento"
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="a-btn a-btn-primary"
              disabled={pending}
              onClick={async () => {
                const res = await run(() => payInstallment(installment.id, { amount: parseMoney(pay.amount), date: pay.date, method: pay.method }));
                if (res.ok) {
                  setOpen(false);
                  router.refresh();
                }
              }}
            >
              {pending ? <Spinner /> : <Check size={16} />} Confirmar
            </button>
          </>
        }
      >
        <div className="a-fields">
          <Field label="Valor recebido (€)" name={`pay-amount-${installment.id}`} hint={`Em falta: ${money(installment.open)}. Se for mais, abate nas seguintes.`}>
            <input id={`f-pay-amount-${installment.id}`} inputMode="decimal" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} />
          </Field>
          <Field label="Data" name={`pay-date-${installment.id}`}>
            <input id={`f-pay-date-${installment.id}`} type="date" value={pay.date} onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))} />
          </Field>
          <Field label="Forma de pagamento" name={`pay-method-${installment.id}`}>
            <select id={`f-pay-method-${installment.id}`} className="a-input" value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value as PaymentMethod }))}>
              {Object.entries(PAYMENT_METHODS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

/* ───────── Nova venda a prestações ───────── */

type CustomerOption = { id: string; label: string };
type StockVehicle = { id: string; label: string; make: string; model: string; color: string; year: number | null; plate: string; vin: string; price: number | null };

export function ChargeContractForm({ customers, vehicles, defaultVehicleId }: { customers: CustomerOption[]; vehicles: StockVehicle[]; defaultVehicleId?: string }) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const first = vehicles.find((v) => v.id === defaultVehicleId);
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState({ fullName: "", phone: "", nif: "", email: "" });
  const [vehicleId, setVehicleId] = useState(first?.id ?? "");
  const [vehicle, setVehicle] = useState({ make: first?.make ?? "", model: first?.model ?? "", color: first?.color ?? "", year: first?.year ? String(first.year) : "", plate: first?.plate ?? "", vin: first?.vin ?? "" });
  const [values, setValues] = useState({ sale: first?.price ? String(first.price) : "", financed: "", down: "", deliveryDate: today, notes: "" });
  const [plan, setPlan] = useState({ count: "6", firstDue: nextMonth });
  const [edited, setEdited] = useState<{ dueDate: string; amount: string }[] | null>(null);

  const toPlan = Math.max(0, toCents(parseMoney(values.sale) || 0) - toCents(parseMoney(values.financed) || 0) - toCents(parseMoney(values.down) || 0));
  const generated = useMemo(() => buildPlan(toPlan, Number(plan.count) || 0, plan.firstDue).map((p) => ({ dueDate: p.dueDate, amount: String(toEuros(p.amountCents)).replace(".", ",") })), [toPlan, plan.count, plan.firstDue]);
  const rows = edited ?? generated;
  const planTotal = rows.reduce((s, r) => s + toCents(parseMoney(r.amount) || 0), 0);

  function pickVehicle(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) {
      setVehicle({ make: v.make, model: v.model, color: v.color, year: v.year ? String(v.year) : "", plate: v.plate, vin: v.vin });
      if (v.price && !values.sale) setValues((x) => ({ ...x, sale: String(v.price) }));
    }
  }

  async function submit() {
    const res = await run(() =>
      createChargeContract({
        ...(customerMode === "existing" ? { customerId } : { newCustomer }),
        vehicleId: vehicleId || null,
        vehicle: { ...vehicle, year: vehicle.year ? Number(vehicle.year) : null },
        deliveryDate: values.deliveryDate || null,
        sale: parseMoney(values.sale),
        financed: parseMoney(values.financed) || 0,
        downPayment: parseMoney(values.down) || 0,
        notes: values.notes,
        installments: rows.map((r) => ({ dueDate: r.dueDate, amount: parseMoney(r.amount) })),
      }),
    );
    if (res.ok) router.push(`/painel/cobrancas/${res.data.id}`);
  }

  const vf = (k: keyof typeof vehicle, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} name={`cv-${k}`} error={errors[`vehicle.${k}`]}>
      <input id={`f-cv-${k}`} value={vehicle[k]} onChange={(e) => setVehicle((v) => ({ ...v, [k]: e.target.value }))} {...props} />
    </Field>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>1. Cliente</h2>
          </div>
          <div className="a-tabs" role="tablist" style={{ border: 0 }}>
            <button type="button" role="tab" aria-selected={customerMode === "existing"} onClick={() => setCustomerMode("existing")}>
              Da lista
            </button>
            <button type="button" role="tab" aria-selected={customerMode === "new"} onClick={() => setCustomerMode("new")}>
              Novo
            </button>
          </div>
        </div>
        <div className="a-card-body a-fields">
          {customerMode === "existing" ? (
            <Field label="Cliente *" name="charge-customer" error={errors.customerId} wide>
              <select id="f-charge-customer" className="a-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Escolher…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Nome *" name="nc-name" error={errors["newCustomer.fullName"]} wide>
                <input id="f-nc-name" value={newCustomer.fullName} onChange={(e) => setNewCustomer((c) => ({ ...c, fullName: e.target.value }))} />
              </Field>
              <Field label="Telefone (para o WhatsApp)" name="nc-phone">
                <input id="f-nc-phone" type="tel" value={newCustomer.phone} onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} />
              </Field>
              <Field label="NIF" name="nc-nif" error={errors["newCustomer.nif"]}>
                <input id="f-nc-nif" inputMode="numeric" value={newCustomer.nif} onChange={(e) => setNewCustomer((c) => ({ ...c, nif: e.target.value }))} />
              </Field>
              <Field label="E-mail" name="nc-email">
                <input id="f-nc-email" type="email" value={newCustomer.email} onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))} />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>2. Viatura</h2>
            <p>Escolha do stock para preencher sozinho, ou escreva.</p>
          </div>
        </div>
        <div className="a-card-body a-fields">
          <Field label="Viatura do stock" name="cv-stock" wide>
            <select id="f-cv-stock" className="a-input" value={vehicleId} onChange={(e) => pickVehicle(e.target.value)}>
              <option value="">Nenhuma / escrever à mão</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          {vf("make", "Marca")}
          {vf("model", "Modelo *")}
          {vf("color", "Cor")}
          {vf("year", "Ano", { inputMode: "numeric" })}
          {vf("plate", "Matrícula")}
          {vf("vin", "VIN")}
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>3. Valores e prestações</h2>
            <p>O financiado pelo banco não é cobrado pelo stand. A entrada fica registada como já recebida.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 16 }}>
          <div className="a-fields">
            <Field label="Valor de venda (€) *" name="cv-sale" error={errors.sale}>
              <input id="f-cv-sale" inputMode="decimal" value={values.sale} onChange={(e) => (setValues((v) => ({ ...v, sale: e.target.value })), setEdited(null))} />
            </Field>
            <Field label="Financiado pelo banco (€)" name="cv-financed" error={errors.financed}>
              <input id="f-cv-financed" inputMode="decimal" value={values.financed} onChange={(e) => (setValues((v) => ({ ...v, financed: e.target.value })), setEdited(null))} placeholder="0" />
            </Field>
            <Field label="Entrada já recebida (€)" name="cv-down" error={errors.downPayment}>
              <input id="f-cv-down" inputMode="decimal" value={values.down} onChange={(e) => (setValues((v) => ({ ...v, down: e.target.value })), setEdited(null))} placeholder="0" />
            </Field>
            <Field label="Data de entrega" name="cv-delivery">
              <input id="f-cv-delivery" type="date" value={values.deliveryDate} onChange={(e) => setValues((v) => ({ ...v, deliveryDate: e.target.value }))} />
            </Field>
            <Field label="Nº de prestações" name="cv-count">
              <input id="f-cv-count" inputMode="numeric" value={plan.count} onChange={(e) => (setPlan((p) => ({ ...p, count: e.target.value })), setEdited(null))} />
            </Field>
            <Field label="1.ª prestação" name="cv-first">
              <input id="f-cv-first" type="date" value={plan.firstDue} onChange={(e) => (setPlan((p) => ({ ...p, firstDue: e.target.value })), setEdited(null))} />
            </Field>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            A dividir em prestações: <strong>{money(toEuros(toPlan))}</strong>. Pode corrigir cada data e valor abaixo.
          </p>
          {rows.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr) minmax(0, 1fr)", gap: 8, alignItems: "center" }}>
                  <span className="muted num">{i + 1}.</span>
                  <input className="a-input" type="date" aria-label={`Data da prestação ${i + 1}`} value={r.dueDate} onChange={(e) => setEdited(rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)))} />
                  <input className="a-input" inputMode="decimal" aria-label={`Valor da prestação ${i + 1}`} value={r.amount} onChange={(e) => setEdited(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                </div>
              ))}
              {planTotal !== toPlan && (
                <Alert kind="warn">
                  <p>
                    As prestações somam {money(toEuros(planTotal))}, mas faltam cobrar {money(toEuros(toPlan))}. A diferença fica no saldo sem prestação.
                  </p>
                </Alert>
              )}
            </div>
          )}
          <Field label="Notas" name="cv-notes" wide>
            <textarea id="f-cv-notes" rows={2} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
          </Field>
        </div>
        <div className="a-form-foot" style={{ margin: 0 }}>
          <button type="button" className="a-btn a-btn-primary" onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : <Check size={16} />} Registar venda a prestações
          </button>
        </div>
      </section>
    </div>
  );
}

/* ───────── Ficha de uma venda ───────── */

type PaymentInfo = { id: string; installmentId: string | null; date: string; amount: number; method: string; note: string };

export function ChargeContractDetail({ contract, payments }: { contract: Contract; payments: PaymentInfo[] }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [extra, setExtra] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), method: "dinheiro" as PaymentMethod });
  const [more, setMore] = useState({ count: "1", firstDue: contract.installments.at(-1)?.dueDate ?? new Date().toISOString().slice(0, 10), amount: contract.unplanned ? String(contract.unplanned).replace(".", ",") : "" });
  const [notes, setNotes] = useState(contract.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = (ok: boolean) => ok && router.refresh();

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="a-stats is-money">
        <div className="a-stat">
          <span>A cobrar</span>
          <strong>{money(contract.toCollect)}</strong>
          <small>Venda {money(contract.sale)}{contract.financed ? ` − banco ${money(contract.financed)}` : ""}</small>
        </div>
        <div className="a-stat">
          <span>Recebido</span>
          <strong className="is-good">{money(contract.paidTotal)}</strong>
        </div>
        <div className="a-stat">
          <span>Falta receber</span>
          <strong>{money(contract.balance)}</strong>
          <small>{contract.installmentsPaid} de {contract.installmentsTotal} prestações pagas</small>
        </div>
        <div className="a-stat">
          <span>Em atraso</span>
          <strong className={contract.lateAmount ? "is-bad" : ""}>{money(contract.lateAmount)}</strong>
          <small>{contract.lateCount ? `${contract.lateCount} prestação(ões)` : "Nada em atraso"}</small>
        </div>
      </div>

      {contract.unplanned > 0 && (
        <Alert kind="warn" title="Saldo sem prestações">
          <p>{money(contract.unplanned)} ainda não têm data marcada. Acrescente prestações abaixo.</p>
        </Alert>
      )}

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Prestações</h2>
          </div>
        </div>
        {contract.installments.length ? (
          <div className="a-docs">
            {contract.installments.map((i) => (
              <div key={i.id} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                <span style={{ minWidth: 0, display: "grid", gap: 4 }}>
                  <strong>
                    {i.number}. {datePt(i.dueDate)} · {money(i.amount)}
                  </strong>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <InstallmentPill status={i.status} daysLate={i.daysLate} />
                    {i.paid > 0 && i.status !== "paga" && <small>Recebido {money(i.paid)}</small>}
                    {i.status === "paga" && i.paidOn && <small>Paga a {datePt(i.paidOn)}</small>}
                  </span>
                </span>
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <InstallmentActions installment={i} customer={contract.customer} vehicle={contract.vehicle.label} />
                  {i.paid === 0 && (
                    <button type="button" className="a-icon-btn" aria-label={`Apagar prestação ${i.number}`} disabled={pending} onClick={async () => refresh((await run(() => deleteInstallment(i.id))).ok)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="a-empty">
            <strong>Sem prestações marcadas.</strong>
          </div>
        )}
        <div className="a-card-body" style={{ borderTop: "1px solid var(--line)", display: "grid", gap: 10 }}>
          <strong style={{ fontWeight: 600 }}>Acrescentar prestações</strong>
          <div className="a-fields">
            <Field label="Quantas" name="more-count">
              <input id="f-more-count" inputMode="numeric" value={more.count} onChange={(e) => setMore((m) => ({ ...m, count: e.target.value }))} />
            </Field>
            <Field label="1.ª data" name="more-first">
              <input id="f-more-first" type="date" value={more.firstDue} onChange={(e) => setMore((m) => ({ ...m, firstDue: e.target.value }))} />
            </Field>
            <Field label="Total a dividir (€)" name="more-amount">
              <input id="f-more-amount" inputMode="decimal" value={more.amount} onChange={(e) => setMore((m) => ({ ...m, amount: e.target.value }))} />
            </Field>
          </div>
          <div>
            <button
              type="button"
              className="a-btn a-btn-sm"
              disabled={pending || !more.amount}
              onClick={async () =>
                refresh(
                  (await run(() => addInstallments(contract.id, buildPlan(toCents(parseMoney(more.amount)), Number(more.count) || 1, more.firstDue).map((p) => ({ dueDate: p.dueDate, amount: toEuros(p.amountCents) })))))
                    .ok,
                )
              }
            >
              <Plus size={14} /> Acrescentar
            </button>
          </div>
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Recebimentos</h2>
            <p>Um valor solto abate nas prestações em aberto mais antigas.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 10 }}>
          <div className="a-fields">
            <Field label="Valor (€)" name="extra-amount">
              <input id="f-extra-amount" inputMode="decimal" value={extra.amount} onChange={(e) => setExtra((x) => ({ ...x, amount: e.target.value }))} />
            </Field>
            <Field label="Data" name="extra-date">
              <input id="f-extra-date" type="date" value={extra.date} onChange={(e) => setExtra((x) => ({ ...x, date: e.target.value }))} />
            </Field>
            <Field label="Forma" name="extra-method">
              <select id="f-extra-method" className="a-input" value={extra.method} onChange={(e) => setExtra((x) => ({ ...x, method: e.target.value as PaymentMethod }))}>
                {Object.entries(PAYMENT_METHODS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div>
            <button
              type="button"
              className="a-btn a-btn-sm a-btn-primary"
              disabled={pending || !extra.amount}
              onClick={async () => {
                const ok = (await run(() => addPayment(contract.id, { amount: parseMoney(extra.amount), date: extra.date, method: extra.method }))).ok;
                if (ok) setExtra((x) => ({ ...x, amount: "" }));
                refresh(ok);
              }}
            >
              <Check size={14} /> Registar recebimento
            </button>
          </div>
        </div>
        {payments.length > 0 && (
          <div className="a-docs" style={{ borderTop: "1px solid var(--line)" }}>
            {payments.map((p) => (
              <div key={p.id} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{datePt(p.date)}</strong>
                  <small>
                    {PAYMENT_METHODS[p.method as PaymentMethod] ?? p.method}
                    {p.note ? ` · ${p.note}` : ""}
                    {!p.installmentId ? " · sem prestação" : ""}
                  </small>
                </span>
                <strong className="num">{money(p.amount)}</strong>
                <button type="button" className="a-icon-btn" aria-label="Apagar recebimento" disabled={pending} onClick={async () => refresh((await run(() => deletePayment(p.id))).ok)}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="a-card a-card-pad" style={{ display: "grid", gap: 10 }}>
        <Field label="Notas" name="charge-notes" wide>
          <textarea id="f-charge-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="a-actions" style={{ justifyContent: "space-between" }}>
          <button type="button" className="a-btn a-btn-sm" disabled={pending || notes === contract.notes} onClick={async () => refresh((await run(() => updateChargeContract(contract.id, { notes }))).ok)}>
            Guardar notas
          </button>
          <button type="button" className="a-btn a-btn-sm a-btn-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> Apagar venda
          </button>
        </div>
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Apagar venda a prestações"
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
                  if ((await run(() => deleteChargeContract(contract.id))).ok) router.push("/painel/cobrancas");
                }}
              >
                Apagar
              </button>
            </>
          }
        >
          <p>Apaga a venda, as prestações e os recebimentos registados. O cliente continua na lista.</p>
        </Dialog>
      </section>
    </div>
  );
}
