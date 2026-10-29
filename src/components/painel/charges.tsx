"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MessageCircle, Plus, RotateCcw, Search, Trash2, UserPlus, X } from "lucide-react";
import {
  addInstallments,
  addPayment,
  createChargeContract,
  deleteChargeContract,
  deleteInstallment,
  deletePayment,
  payInstallment,
  setChargeSecondHolder,
  undoInstallment,
  updateChargeContract,
} from "@/app/painel/_actions/cobrancas";
import {
  addDays,
  addMonths,
  buildPlan,
  chargeMessage,
  datePt,
  inferInterval,
  intervalLabel,
  money,
  CONTRACT_STATUS_LABEL,
  DEFAULT_CHARGE_MESSAGE,
  INSTALLMENT_STATUS_LABEL,
  INTERVAL_PRESETS,
  PAYMENT_METHODS,
  toCents,
  toEuros,
  whatsappLink,
  type Contract,
  type ContractStatus,
  type Installment,
  type InstallmentStatus,
  type PaymentMethod,
} from "@/lib/cobrancas";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

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

/** "De quanto em quanto tempo paga?": todos os meses ou a cada N dias. */
function IntervalField({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  const isPreset = value === "" || INTERVAL_PRESETS.some((p) => p.value === value);
  const [custom, setCustom] = useState(!isPreset);
  return (
    <Field label="De quanto em quanto tempo paga? *" name={id} error={error}>
      <select
        id={`f-${id}`}
        className="a-input"
        value={custom ? "outro" : value}
        onChange={(e) => {
          const v = e.target.value;
          setCustom(v === "outro");
          onChange(v === "outro" ? "" : v);
        }}
      >
        <option value="">Escolher…</option>
        {INTERVAL_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        <option value="outro">Outro número de dias…</option>
      </select>
      {custom && (
        <input
          aria-label="A cada quantos dias"
          inputMode="numeric"
          placeholder="Nº de dias, ex.: 10"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
          style={{ marginTop: 8 }}
        />
      )}
    </Field>
  );
}

/* ───────── Lista de todas as vendas, com pesquisa ───────── */

export type ContractListItem = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  balance: number;
  toCollect: number;
  nextDue: string | null;
  status: ContractStatus;
};

const CONTRACT_PILL: Record<ContractStatus, string> = { em_dia: "available", atrasado: "danger", quitado: "neutral", sem_plano: "reserved" };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ChargeContractList({ items }: { items: ContractListItem[] }) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const digits = query.replace(/\D/g, "");
  const shown = q
    ? items.filter((c) => fold(`${c.name} ${c.vehicle} ${c.plate}`).includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits)))
    : items;
  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Todas as vendas a prestações</h2>
          <p>{items.length} cliente{items.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="a-card-body" style={{ paddingBottom: 0 }}>
        <div className="a-search" style={{ maxWidth: "none" }} role="search">
          <Search size={16} aria-hidden="true" />
          <input className="a-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por nome, telefone, carro ou matrícula" aria-label="Procurar cliente" />
        </div>
      </div>
      {shown.length ? (
        <div className="a-docs" style={{ marginTop: 12 }}>
          {shown.map((c) => (
            <Link key={c.id} href={`/painel/cobrancas/${c.id}`} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", color: "inherit", textDecoration: "none" }}>
              <span style={{ minWidth: 0 }}>
                <strong>{c.name}</strong>
                <small style={{ display: "block" }}>
                  {c.vehicle}
                  {c.plate ? ` · ${c.plate}` : ""}
                </small>
                <small style={{ display: "block" }}>
                  Falta {money(c.balance)} de {money(c.toCollect)}
                  {c.nextDue ? ` · próxima ${datePt(c.nextDue)}` : ""}
                </small>
              </span>
              <span className={`a-pill ${CONTRACT_PILL[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="a-empty">
          <strong>{items.length ? `Ninguém encontrado com «${query.trim()}».` : "Ainda não há vendas a prestações."}</strong>
        </div>
      )}
    </section>
  );
}

/* ───────── Nova venda a prestações ───────── */

type CustomerOption = { id: string; label: string };
type StockVehicle = { id: string; label: string; make: string; model: string; color: string; year: number | null; plate: string; vin: string; price: number | null };
type Errors = Record<string, string | undefined>;

/** Ficha nova criada com a venda (o documento vem calado quando chega da compra e venda). */
export type Person = {
  fullName: string;
  phone: string;
  nif: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  idDocumentType?: string;
  idDocumentNumber?: string;
  idDocumentExpiry?: string;
};
export type HolderDraft = { mode: "existing" | "new"; customerId: string; newCustomer: Person };
/** Dados que chegam de outra página (ex.: compra e venda) para conferir. */
export type ChargePrefill = {
  from: string;
  registrationId?: string;
  values?: { sale: string; down: string; bank: string; debt: string };
  holder: HolderDraft;
  second: HolderDraft | null;
  vehicleId: string;
  vehicle: { make: string; model: string; plate: string; vin: string };
  deliveryDate: string;
};

export const emptyPerson = (): Person => ({ fullName: "", phone: "", nif: "", email: "", address: "", postalCode: "", city: "" });
const holderPayload = (h: HolderDraft) => (h.mode === "existing" ? { customerId: h.customerId } : { newCustomer: h.newCustomer });

function PersonFields({ id, value, onChange, errors, errorKey }: { id: string; value: Person; onChange: (p: Person) => void; errors: Errors; errorKey: string }) {
  const f = (k: keyof Person, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => (
    <Field label={label} name={`${id}-${k}`} error={errors[`${errorKey}.${k}`]} wide={wide}>
      <input id={`f-${id}-${k}`} value={value[k] ?? ""} onChange={(e) => onChange({ ...value, [k]: e.target.value })} {...props} />
    </Field>
  );
  return (
    <>
      {f("fullName", "Nome *", {}, true)}
      {f("phone", "Telefone (para o WhatsApp)", { type: "tel" })}
      {f("nif", "NIF", { inputMode: "numeric" })}
      {f("email", "E-mail", { type: "email" })}
      {f("address", "Morada", {}, true)}
      {f("postalCode", "Código postal", { placeholder: "0000-000" })}
      {f("city", "Localidade")}
    </>
  );
}

/** Segundo titular: escolher da lista ou criar a ficha. */
function HolderInputs({
  id,
  value,
  onChange,
  customers,
  exclude,
  errors,
  errorKey,
}: {
  id: string;
  value: HolderDraft;
  onChange: (h: HolderDraft) => void;
  customers: CustomerOption[];
  exclude?: string;
  errors: Errors;
  errorKey: string;
}) {
  return (
    <>
      <div className="a-tabs" role="tablist" aria-label="Segundo titular / fiador" style={{ border: 0 }}>
        <button type="button" role="tab" aria-selected={value.mode === "existing"} onClick={() => onChange({ ...value, mode: "existing" })}>
          Da lista
        </button>
        <button type="button" role="tab" aria-selected={value.mode === "new"} onClick={() => onChange({ ...value, mode: "new" })}>
          Novo
        </button>
      </div>
      <div className="a-fields">
        {value.mode === "existing" ? (
          <Field label="Segundo titular / fiador *" name={`${id}-customer`} error={errors[`${errorKey}customerId`]} wide>
            <select id={`f-${id}-customer`} className="a-input" value={value.customerId} onChange={(e) => onChange({ ...value, customerId: e.target.value })}>
              <option value="">Escolher…</option>
              {customers
                .filter((c) => c.id !== exclude)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <PersonFields id={id} value={value.newCustomer} onChange={(p) => onChange({ ...value, newCustomer: p })} errors={errors} errorKey={`${errorKey}newCustomer`} />
        )}
      </div>
    </>
  );
}

export function ChargeContractForm({
  customers,
  vehicles,
  defaultVehicleId,
  prefill,
}: {
  customers: CustomerOption[];
  vehicles: StockVehicle[];
  defaultVehicleId?: string;
  prefill?: ChargePrefill;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const first = vehicles.find((v) => v.id === (prefill?.vehicleId || defaultVehicleId));
  const pv = prefill?.vehicle;
  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(prefill?.holder.mode ?? (customers.length ? "existing" : "new"));
  const [customerId, setCustomerId] = useState(prefill?.holder.customerId ?? "");
  const [newCustomer, setNewCustomer] = useState<Person>(prefill?.holder.newCustomer ?? emptyPerson());
  const [second, setSecond] = useState<HolderDraft | null>(prefill?.second ?? null);
  const [vehicleId, setVehicleId] = useState(first?.id ?? "");
  const [vehicle, setVehicle] = useState({
    make: first?.make ?? pv?.make ?? "",
    model: first?.model ?? pv?.model ?? "",
    color: first?.color ?? "",
    year: first?.year ? String(first.year) : "",
    plate: first?.plate ?? pv?.plate ?? "",
    vin: first?.vin ?? pv?.vin ?? "",
  });
  const pre = prefill?.values;
  const [values, setValues] = useState({
    sale: pre?.sale || (first?.price ? String(first.price) : ""),
    down: pre?.down ?? "",
    bank: pre?.bank ?? "",
    debt: pre?.debt ?? "",
    deliveryDate: prefill?.deliveryDate || today,
    notes: "",
  });
  /** Enquanto ninguém escreve a dívida, sugere-se venda − entrada − banco. */
  const [debtTouched, setDebtTouched] = useState(Boolean(pre?.debt));
  const [plan, setPlan] = useState({ count: "6", firstDue: nextMonth, every: "" });
  const [planError, setPlanError] = useState("");
  const [edited, setEdited] = useState<{ dueDate: string; amount: string }[] | null>(null);
  const [withContract, setWithContract] = useState(true);

  const suggestedDebt = Math.max(0, toCents(parseMoney(values.sale) || 0) - toCents(parseMoney(values.down) || 0) - toCents(parseMoney(values.bank) || 0));
  const debtText = debtTouched ? values.debt : suggestedDebt ? String(toEuros(suggestedDebt)).replace(".", ",") : "";
  const toPlan = Math.max(0, toCents(parseMoney(debtText) || 0));
  const generated = useMemo(
    () =>
      plan.every
        ? buildPlan(toPlan, Number(plan.count) || 0, plan.firstDue, plan.every).map((p) => ({ dueDate: p.dueDate, amount: String(toEuros(p.amountCents)).replace(".", ",") }))
        : [],
    [toPlan, plan.count, plan.firstDue, plan.every],
  );
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
    if (Number(plan.count) > 0 && !plan.every) {
      setPlanError("Escolha de quanto em quanto tempo o cliente paga.");
      return;
    }
    const res = await run(() =>
      createChargeContract({
        ...(customerMode === "existing" ? { customerId } : { newCustomer }),
        second: second ? holderPayload(second) : null,
        registrationId: prefill?.registrationId,
        vehicleId: vehicleId || null,
        vehicle: { ...vehicle, year: vehicle.year ? Number(vehicle.year) : null },
        deliveryDate: values.deliveryDate || null,
        sale: parseMoney(values.sale),
        downPayment: parseMoney(values.down) || 0,
        financed: parseMoney(values.bank) || 0,
        debt: parseMoney(debtText),
        notes: values.notes,
        installments: rows.map((r) => ({ dueDate: r.dueDate, amount: parseMoney(r.amount) })),
      }),
    );
    if (res.ok) router.push(`/painel/cobrancas/${res.data.id}${withContract ? "?contrato=1" : ""}`);
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
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {prefill && (
            <Alert kind="info">
              <p>Dados vindos {prefill.from}. Confira e complete os valores.</p>
            </Alert>
          )}
          <div className="a-fields">
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
              <PersonFields id="nc" value={newCustomer} onChange={setNewCustomer} errors={errors} errorKey="newCustomer" />
            )}
          </div>
          <div className="a-second-holder">
            {second ? (
              <>
                <div className="a-second-holder-head">
                  <div>
                    <strong>Segundo titular / fiador</strong>
                    <p className="muted">Garante a dívida com o cliente. No contrato entra como avalista.</p>
                  </div>
                  <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setSecond(null)}>
                    <X size={15} /> Tirar
                  </button>
                </div>
                <HolderInputs id="sh" value={second} onChange={setSecond} customers={customers} exclude={customerMode === "existing" ? customerId : undefined} errors={errors} errorKey="second." />
              </>
            ) : (
              <button type="button" className="a-btn a-btn-sm" onClick={() => setSecond({ mode: customers.length ? "existing" : "new", customerId: "", newCustomer: emptyPerson() })}>
                <UserPlus size={15} /> Segundo titular / fiador (opcional)
              </button>
            )}
          </div>
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
            <p>A dívida é o valor que o stand financia e cobra ao cliente em prestações. As prestações dividem a dívida, não a venda.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 16 }}>
          <div className="a-fields">
            <Field label="Valor de venda (€) *" name="cv-sale" error={errors.sale}>
              <input id="f-cv-sale" inputMode="decimal" value={values.sale} onChange={(e) => (setValues((v) => ({ ...v, sale: e.target.value })), setEdited(null))} />
            </Field>
            <Field label="Entrada (€)" name="cv-down" error={errors.downPayment} hint="Paga na entrega. Não entra na dívida.">
              <input id="f-cv-down" inputMode="decimal" value={values.down} onChange={(e) => (setValues((v) => ({ ...v, down: e.target.value })), setEdited(null))} placeholder="0" />
            </Field>
            <Field label="Pago pelo banco / financeira (€)" name="cv-bank" error={errors.financed} hint="Crédito automóvel, se houver. Não entra na dívida.">
              <input id="f-cv-bank" inputMode="decimal" value={values.bank} onChange={(e) => (setValues((v) => ({ ...v, bank: e.target.value })), setEdited(null))} placeholder="0" />
            </Field>
            <Field
              label="Valor da dívida (€) *"
              name="cv-debt"
              error={errors.debt}
              hint={debtTouched ? "Financiado pelo stand. Pode incluir juros." : "Sugerido: venda − entrada − banco. Altere se tiver juros."}
            >
              <input
                id="f-cv-debt"
                inputMode="decimal"
                value={debtText}
                onChange={(e) => (setDebtTouched(true), setValues((v) => ({ ...v, debt: e.target.value })), setEdited(null))}
              />
            </Field>
            <Field label="Data de entrega" name="cv-delivery">
              <input id="f-cv-delivery" type="date" value={values.deliveryDate} onChange={(e) => setValues((v) => ({ ...v, deliveryDate: e.target.value }))} />
            </Field>
            <Field label="Nº de prestações" name="cv-count">
              <input id="f-cv-count" inputMode="numeric" value={plan.count} onChange={(e) => (setPlan((p) => ({ ...p, count: e.target.value })), setEdited(null))} />
            </Field>
            <IntervalField
              id="cv-every"
              value={plan.every}
              error={planError}
              onChange={(every) => (setPlan((p) => ({ ...p, every })), setPlanError(""), setEdited(null))}
            />
            <Field label="1.ª prestação" name="cv-first">
              <input id="f-cv-first" type="date" value={plan.firstDue} onChange={(e) => (setPlan((p) => ({ ...p, firstDue: e.target.value })), setEdited(null))} />
            </Field>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Dívida a dividir em prestações: <strong>{money(toEuros(toPlan))}</strong>
            {plan.every ? `, ${intervalLabel(plan.every)}` : ""}. {plan.every ? "Pode corrigir cada data e valor abaixo." : "Escolha de quanto em quanto tempo paga para montar as prestações."}
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
                    As prestações somam {money(toEuros(planTotal))}, mas a dívida é {money(toEuros(toPlan))}. A diferença fica no saldo sem prestação.
                  </p>
                </Alert>
              )}
            </div>
          )}
          <Field label="Notas" name="cv-notes" wide>
            <textarea id="f-cv-notes" rows={2} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} />
          </Field>
        </div>
        <div className="a-form-foot" style={{ margin: 0, flexWrap: "wrap", gap: 12 }}>
          <label className="a-check" style={{ marginRight: "auto" }}>
            <input type="checkbox" checked={withContract} onChange={(e) => setWithContract(e.target.checked)} />
            <span>A seguir, gerar o contrato para assinar</span>
          </label>
          <button type="button" className="a-btn a-btn-primary" onClick={submit} disabled={pending}>
            {pending ? <Spinner /> : <Check size={16} />} Registar venda a prestações
          </button>
        </div>
      </section>
    </div>
  );
}

/* ───────── Ficha de uma venda ───────── */

/** Pôr, trocar ou tirar o segundo titular / fiador de uma venda já registada. */
export function SecondHolderCard({
  contractId,
  current,
  customers,
  mainCustomerId,
}: {
  contractId: string;
  current: { id: string; name: string } | null;
  customers: CustomerOption[];
  mainCustomerId: string;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [draft, setDraft] = useState<HolderDraft | null>(null);
  const start = () => setDraft({ mode: customers.length ? "existing" : "new", customerId: "", newCustomer: emptyPerson() });
  async function save(value: HolderDraft | null) {
    const res = await run(() => setChargeSecondHolder(contractId, value ? holderPayload(value) : null));
    if (res.ok) {
      setDraft(null);
      router.refresh();
    }
  }
  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Segundo titular / fiador</h2>
          <p>Opcional. Garante a dívida com o cliente e entra no contrato como avalista.</p>
        </div>
        {!draft &&
          (current ? (
            <div className="a-actions">
              <button type="button" className="a-btn a-btn-sm" onClick={start}>
                Trocar
              </button>
              <button type="button" className="a-btn a-btn-sm a-btn-ghost" disabled={pending} onClick={() => confirm(`Tirar ${current.name} desta venda?`) && void save(null)}>
                <X size={15} /> Tirar
              </button>
            </div>
          ) : (
            <button type="button" className="a-btn a-btn-sm" onClick={start}>
              <UserPlus size={15} /> Adicionar
            </button>
          ))}
      </div>
      {current && !draft && (
        <div className="a-card-body">
          <Link href={`/painel/clientes/${current.id}`} className="a-row-link">
            {current.name}
          </Link>
        </div>
      )}
      {draft && (
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          <HolderInputs id="sh" value={draft} onChange={setDraft} customers={customers} exclude={mainCustomerId} errors={errors} errorKey="" />
          <div className="a-actions">
            <button type="button" className="a-btn" onClick={() => setDraft(null)}>
              Cancelar
            </button>
            <button type="button" className="a-btn a-btn-primary" onClick={() => void save(draft)} disabled={pending}>
              {pending ? <Spinner /> : <Check size={16} />} Guardar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

type PaymentInfo = { id: string; installmentId: string | null; date: string; amount: number; method: string; note: string };

/** `documents`: cartão do contrato para assinar, mostrado antes das notas e de "Apagar venda". */
export function ChargeContractDetail({ contract, payments, documents }: { contract: Contract; payments: PaymentInfo[]; documents?: React.ReactNode }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [extra, setExtra] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), method: "dinheiro" as PaymentMethod });
  const currentInterval = inferInterval(contract.installments.map((i) => i.dueDate));
  const lastDue = contract.installments.at(-1)?.dueDate;
  const nextDue = lastDue && currentInterval ? (currentInterval === "mensal" ? addMonths(lastDue, 1) : addDays(lastDue, Number(currentInterval))) : (lastDue ?? new Date().toISOString().slice(0, 10));
  const [more, setMore] = useState({ count: "1", firstDue: nextDue, every: currentInterval ?? "", amount: contract.unplanned ? String(contract.unplanned).replace(".", ",") : "" });
  const [notes, setNotes] = useState(contract.notes);
  const euros = (v: number) => (v ? String(v).replace(".", ",") : "");
  const [vals, setVals] = useState({ sale: euros(contract.sale), down: euros(contract.down), debt: euros(contract.toCollect), delivery: contract.deliveryDate ?? "" });
  const valsChanged =
    vals.sale !== euros(contract.sale) || vals.down !== euros(contract.down) || vals.debt !== euros(contract.toCollect) || vals.delivery !== (contract.deliveryDate ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = (ok: boolean) => ok && router.refresh();

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="a-stats is-money">
        <div className="a-stat">
          <span>Dívida</span>
          <strong>{money(contract.toCollect)}</strong>
          <small>
            Venda {money(contract.sale)}
            {contract.down ? ` · entrada ${money(contract.down)}` : ""}
            {contract.financed ? ` · banco ${money(contract.financed)}` : ""}
          </small>
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
            {currentInterval && <p>Pagas {intervalLabel(currentInterval)}.</p>}
          </div>
        </div>
        {contract.installments.length ? (
          <div className="a-docs">
            {contract.installments.map((i) => (
              <div key={i.id} className="a-doc a-doc-pay">
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
            <IntervalField id="more-every" value={more.every} onChange={(every) => setMore((m) => ({ ...m, every }))} />
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
              disabled={pending || !more.amount || !more.every}
              onClick={async () =>
                refresh(
                  (
                    await run(() =>
                      addInstallments(
                        contract.id,
                        buildPlan(toCents(parseMoney(more.amount)), Number(more.count) || 1, more.firstDue, more.every).map((p) => ({ dueDate: p.dueDate, amount: toEuros(p.amountCents) })),
                      ),
                    )
                  ).ok,
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
        <strong style={{ fontWeight: 600 }}>Valores da venda</strong>
        <div className="a-fields">
          <Field label="Valor de venda (€)" name="edit-sale">
            <input id="f-edit-sale" inputMode="decimal" value={vals.sale} onChange={(e) => setVals((v) => ({ ...v, sale: e.target.value }))} />
          </Field>
          <Field label="Entrada (€)" name="edit-down">
            <input id="f-edit-down" inputMode="decimal" value={vals.down} onChange={(e) => setVals((v) => ({ ...v, down: e.target.value }))} placeholder="0" />
          </Field>
          <Field label="Valor da dívida (€)" name="edit-debt" hint="Financiado pelo stand: é o que se cobra em prestações.">
            <input id="f-edit-debt" inputMode="decimal" value={vals.debt} onChange={(e) => setVals((v) => ({ ...v, debt: e.target.value }))} />
          </Field>
          <Field label="Data de entrega" name="edit-delivery">
            <input id="f-edit-delivery" type="date" value={vals.delivery} onChange={(e) => setVals((v) => ({ ...v, delivery: e.target.value }))} />
          </Field>
        </div>
        <div>
          <button
            type="button"
            className="a-btn a-btn-sm"
            disabled={pending || !valsChanged || !vals.sale || !vals.debt}
            onClick={async () =>
              refresh((await run(() => updateChargeContract(contract.id, { sale: parseMoney(vals.sale), down: parseMoney(vals.down) || 0, debt: parseMoney(vals.debt), deliveryDate: vals.delivery || null }))).ok)
            }
          >
            Guardar valores
          </button>
        </div>
      </section>

      {documents}

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
