"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, FileDown, Pencil, Search, UserPlus, Users } from "lucide-react";
import { completeSale, dealCustomer, reviewSale, type ContractField } from "@/app/painel/_actions/sales";
import { createCustomer } from "@/app/painel/_actions/customers";
import { eurosPorExtenso, parseEuros } from "@/lib/extenso";
import { isValidNif } from "@/lib/pt-validation";
import { DEAL_DOCUMENTS, type DealMode, type TemplateId } from "@/lib/form-templates";
import { AiReader, type FieldMeta } from "./ai-reader";
import { ContractFields } from "./contract-fields";
import { Alert, Field, Spinner, useAction } from "./ui";

type CustomerOption = { id: string; fullName: string; nif: string | null; label: string };
type DocOption = { id: TemplateId; title: string; description: string };

const NEW_FIELDS: FieldMeta[] = [
  { key: "fullName", label: "Nome", important: true },
  { key: "nif", label: "NIF", important: true },
  { key: "idDocumentType", label: "Tipo de documento" },
  { key: "idDocumentNumber", label: "Nº do documento", important: true },
  { key: "idDocumentExpiry", label: "Validade" },
  { key: "birthDate", label: "Nascimento" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "address", label: "Morada", important: true },
  { key: "postalCode", label: "Código postal", important: true },
  { key: "city", label: "Localidade", important: true },
  { key: "country", label: "País" },
  { key: "drivingLicenseNumber", label: "Carta de condução" },
  { key: "drivingLicenseIssuedAt", label: "Emissão da carta" },
];

/** Ficha do cliente escolhido, mostrada já preenchida para conferir (ex.: contrato com outra morada). */
const BUYER_FIELDS: [key: string, label: string, props?: React.InputHTMLAttributes<HTMLInputElement>, wide?: boolean][] = [
  ["fullName", "Nome completo *", {}, true],
  ["nif", "NIF", { inputMode: "numeric", maxLength: 11 }],
  ["idDocumentType", "Tipo de documento"],
  ["idDocumentNumber", "Nº do documento"],
  ["idDocumentExpiry", "Validade", { type: "date" }],
  ["birthDate", "Data de nascimento", { type: "date" }],
  ["nationality", "Nacionalidade"],
  ["drivingLicenseNumber", "Nº da carta de condução"],
  ["drivingLicenseIssuedAt", "Emissão da carta", { type: "date" }],
  ["address", "Morada", {}, true],
  ["postalCode", "Código postal", { placeholder: "0000-000" }],
  ["city", "Localidade"],
  ["country", "País"],
  ["phone", "Telefone", { type: "tel" }],
  ["email", "E-mail", { type: "email" }],
];

const CONSIGNMENT_FIELDS: FieldMeta[] = [
  { key: "make", label: "Marca", important: true },
  { key: "model", label: "Modelo", important: true },
  { key: "plate", label: "Matrícula", important: true },
  { key: "year", label: "Ano" },
  { key: "vin", label: "Nº de quadro (VIN)", important: true },
  { key: "mileageKm", label: "Quilómetros" },
];
const CONSIGNMENT_INPUTS: [key: string, label: string, props?: React.InputHTMLAttributes<HTMLInputElement>, wide?: boolean][] = [
  ["make", "Marca *"],
  ["model", "Modelo *"],
  ["plate", "Matrícula *", { placeholder: "AA-00-BB" }],
  ["year", "Ano *", { inputMode: "numeric", maxLength: 4 }],
  ["vin", "Nº de quadro (VIN) *", { maxLength: 17 }],
  ["mileageKm", "Quilómetros *", { inputMode: "numeric" }],
  ["price", "Preço mínimo de venda (€) *", { inputMode: "decimal", placeholder: "ex.: 15000" }],
  ["iban", "IBAN do cliente *", { placeholder: "PT50 …" }, true],
];

const RENT_PAYMENT = "Pago por transferência bancária MBWAY/IBAN ou em dinheiro no ato da assinatura.";

export function SalePanel({
  mode: deal = "sale",
  vehicleId,
  vehicleLabel,
  customers,
  documents,
  defaults,
  sold,
  canMarkSold,
  canCreateCustomer,
}: {
  mode?: DealMode;
  vehicleId: string;
  vehicleLabel: string;
  customers: CustomerOption[];
  documents: DocOption[];
  defaults: { customerId: string | null; priceEur: number | null; km: number | null };
  sold: { buyer: string | null; date: string | null } | null;
  canMarkSold: boolean;
  canCreateCustomer: boolean;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [mode, setMode] = useState<"existing" | "new">(defaults.customerId || !canCreateCustomer ? "existing" : customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState(defaults.customerId ?? "");
  const [picking, setPicking] = useState(!defaults.customerId);
  const [buyer, setBuyer] = useState<Record<string, string> | null>(null);
  const [buyerOrig, setBuyerOrig] = useState<Record<string, string>>({});
  const [buyerError, setBuyerError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [list, setList] = useState(customers);
  const [newC, setNewC] = useState<Record<string, string>>({ country: "Portugal" });
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [attach, setAttach] = useState<string[]>([]);
  const now = new Date();
  const [sale, setSale] = useState({
    priceEur: defaults.priceEur != null ? String(defaults.priceEur) : "",
    date: now.toISOString().slice(0, 10),
    time: now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }),
    km: defaults.km != null ? String(defaults.km) : "",
    place: "",
    notes: "",
  });
  const [docs, setDocs] = useState<Set<TemplateId>>(new Set(DEAL_DOCUMENTS[deal].filter((d) => documents.some((x) => x.id === d))));
  const [markSold, setMarkSold] = useState(deal === "sale" && canMarkSold && !sold);
  const isRent = deal === "rent";
  const who = isRent ? "locatário" : "comprador";
  const Who = isRent ? "Locatário" : "Comprador";
  const [warranty, setWarranty] = useState({ months: "18", number: "", extras: "" });
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [rental, setRental] = useState({
    startDate: now.toISOString().slice(0, 10),
    startTime: "17:00",
    endDate: inAWeek,
    endTime: "17:00",
    kmOut: defaults.km != null ? String(defaults.km) : "",
    totalEur: "",
    paymentMethod: RENT_PAYMENT,
  });
  const [done, setDone] = useState<{ title: string; url: string; format: "docx" | "pdf" }[] | null>(null);
  // Carro que o cliente deixa no stand para vender (Contrato de consignação).
  const [consignment, setConsignment] = useState<Record<string, string>>({});
  const withConsignment = docs.has("contrato_consignacao");
  const consignmentPrice = parseEuros(consignment.price ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.label.toLowerCase().includes(q)) : list;
  }, [list, query]);
  const selected = list.find((c) => c.id === customerId);

  // Ao escolher o cliente, a ficha aparece logo preenchida para conferir e corrigir.
  useEffect(() => {
    let live = true;
    setBuyer(null);
    setBuyerError(null);
    if (!customerId) return;
    dealCustomer(customerId)
      .then((res) => {
        if (!live) return;
        if (res.ok) {
          setBuyer(res.data);
          setBuyerOrig(res.data);
        } else setBuyerError(res.error);
      })
      .catch(() => live && setBuyerError("Sem ligação ao servidor. Tente de novo."));
    return () => {
      live = false;
    };
  }, [customerId]);
  const buyerChanged = buyer ? BUYER_FIELDS.filter(([k]) => (buyer[k] ?? "") !== (buyerOrig[k] ?? "")).map(([, label]) => label.replace(" *", "")) : [];
  const nifWarn = newC.nif && newC.nif.replace(/\D/g, "").length === 9 && !isValidNif(newC.nif);

  const setNew = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewC((v) => ({ ...v, [k]: e.target.value }));
    setSuggested((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  };

  async function createNew() {
    const form = new FormData();
    for (const [k, v] of Object.entries(newC)) form.set(k, v);
    form.set("source", isRent ? "Aluguer" : "Venda");
    const res = await run(() => createCustomer(form, attach));
    if (res.ok) {
      const c = { id: res.data.id, fullName: newC.fullName, nif: newC.nif || null, label: newC.nif ? `${newC.fullName} · NIF ${newC.nif.replace(/\D/g, "")}` : newC.fullName };
      setList((l) => [c, ...l]);
      setCustomerId(c.id);
      setPicking(false);
      setMode("existing");
      setNewC({ country: "Portugal" });
      setSuggested(new Set());
      setAttach([]);
    }
  }

  // Passo 4: dados do contrato, revistos e completados antes de gerar.
  const [review, setReview] = useState<ContractField[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saveToRecords, setSaveToRecords] = useState(true);
  const [saved, setSaved] = useState<string[]>([]);
  const saleKey = JSON.stringify([customerId, buyer, sale, warranty, rental, [...docs].sort(), withConsignment ? consignment : null]);
  // Qualquer alteração nos passos 1–3 obriga a rever de novo.
  useEffect(() => {
    setReview(null);
    setEdited({});
  }, [saleKey]);

  const money = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0;
  const baseInput = () => ({
    mode: deal,
    customerId,
    ...(buyer ? { customer: buyer } : {}),
    priceEur: isRent ? null : money(sale.priceEur),
    ...(isRent
      ? {
          rental: {
            startDate: rental.startDate,
            startTime: rental.startTime,
            endDate: rental.endDate,
            endTime: rental.endTime,
            kmOut: rental.kmOut ? Number(rental.kmOut.replace(/\D/g, "")) : null,
            totalEur: rental.totalEur ? money(rental.totalEur) : null,
            paymentMethod: rental.paymentMethod,
          },
        }
      : { warranty: { months: Number(warranty.months) || null, number: warranty.number, extras: warranty.extras } }),
    date: sale.date,
    time: sale.time,
    deliveryKm: sale.km ? Number(sale.km.replace(/\D/g, "")) : null,
    place: sale.place,
    notes: sale.notes,
    documents: [...docs],
    ...(withConsignment
      ? {
          consignment: {
            make: consignment.make ?? "",
            model: consignment.model ?? "",
            plate: consignment.plate ?? "",
            year: Number(consignment.year?.replace(/\D/g, "")) || null,
            vin: consignment.vin ?? "",
            km: consignment.mileageKm?.trim() ? Number(consignment.mileageKm.replace(/\D/g, "")) : null,
            minPriceEur: consignmentPrice,
            iban: consignment.iban ?? "",
          },
        }
      : {}),
  });

  async function prepare() {
    const res = await run(() => reviewSale(vehicleId, baseInput()), { quiet: true });
    if (res.ok) {
      setReview(res.data.fields);
      setEdited({});
      requestAnimationFrame(() => document.getElementById("dados-contrato")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const valueOf = (f: ContractField) => edited[f.key] ?? f.value;
  const missing = review ? review.filter((f) => f.required && !valueOf(f).trim()) : [];

  async function submit() {
    if (!review) return;
    const res = await run(() => completeSale(vehicleId, { ...baseInput(), markSold, values: Object.fromEntries(review.map((f) => [f.key, valueOf(f)])), saveToRecords }));
    if (res.ok) {
      setSaved(res.data.saved);
      setDone(res.data.documents);
      router.refresh();
    }
  }

  const nf = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide?: boolean) => (
    <Field label={label} name={`new-${name}`} wide={wide} suggested={suggested.has(name)} error={errors[name] ?? (name === "nif" && nifWarn ? "Este NIF não passa na validação." : undefined)}>
      <input id={`f-new-${name}`} value={newC[name] ?? ""} onChange={setNew(name)} {...props} />
    </Field>
  );

  if (done)
    return (
      <section className="a-card a-card-pad" style={{ display: "grid", gap: 16 }}>
        <Alert kind="ok" title={isRent ? `${vehicleLabel} alugado a ${buyer?.fullName || selected?.fullName || "cliente"}` : markSold ? `${vehicleLabel} vendido a ${buyer?.fullName || selected?.fullName || "cliente"}` : "Documentos gerados"}>
          <p>Abra, confira e imprima para assinar. Ficam guardados no separador Termos da viatura e na ficha do cliente.</p>
          {saved.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Os dados completados foram guardados em: {saved.join(", ")}.</p>}
        </Alert>
        <div className="a-actions">
          {done.map((d) => (
            <a key={d.url} className="a-btn a-btn-primary" href={d.url} target="_blank" rel="noopener">
              <FileDown size={16} /> {d.title} (PDF)
            </a>
          ))}
        </div>
        <div>
          <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setDone(null)}>
            Gerar novamente
          </button>
        </div>
      </section>
    );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {sold && (
        <Alert kind="info" title="Esta viatura já está vendida">
          <p>
            {sold.buyer ? `Comprador: ${sold.buyer}. ` : ""}
            {sold.date ? `Data: ${sold.date}. ` : ""}Pode voltar a gerar os documentos abaixo.
          </p>
        </Alert>
      )}

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>1. {Who}</h2>
            <p>Escolha um cliente da lista ou crie um novo a partir do documento de identificação.</p>
          </div>
          {canCreateCustomer && (
            <div className="a-tabs" role="tablist" style={{ border: 0 }}>
              <button type="button" role="tab" aria-selected={mode === "existing"} onClick={() => setMode("existing")}>
                <Users size={15} /> Cliente existente
              </button>
              <button type="button" role="tab" aria-selected={mode === "new"} onClick={() => setMode("new")}>
                <UserPlus size={15} /> Novo cliente
              </button>
            </div>
          )}
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {mode === "existing" ? (
            <>
              {customerId && !picking ? (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <p style={{ margin: 0 }}>
                      {Who}: <strong>{buyer?.fullName || selected?.fullName}</strong>
                    </p>
                    <button type="button" className="a-btn a-btn-sm" onClick={() => setPicking(true)}>
                      <Users size={15} /> Trocar cliente
                    </button>
                  </div>
                  {buyerError ? (
                    <Alert kind="danger">{buyerError}</Alert>
                  ) : !buyer ? (
                    <p className="muted" style={{ margin: 0 }}>
                      <Spinner /> A carregar a ficha…
                    </p>
                  ) : (
                    <>
                      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                        <Pencil size={13} aria-hidden="true" /> Confira os dados. O que corrigir aqui (ex.: outra morada) vai para os documentos e, com a opção do fim ligada, também para a ficha do cliente.
                      </p>
                      <div className="a-fields">
                        {BUYER_FIELDS.map(([k, label, props, wide]) => (
                          <Field key={k} label={label} name={`buyer-${k}`} wide={wide} error={errors[`customer.${k}`]}>
                            <input
                              id={`f-buyer-${k}`}
                              value={buyer[k] ?? ""}
                              onChange={(e) => setBuyer((b) => (b ? { ...b, [k]: e.target.value } : b))}
                              aria-invalid={Boolean(errors[`customer.${k}`])}
                              {...props}
                            />
                          </Field>
                        ))}
                      </div>
                      {buyerChanged.length > 0 && (
                        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                          Alterado: {buyerChanged.join(", ")}.{" "}
                          <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setBuyer(buyerOrig)}>
                            Desfazer
                          </button>
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="a-search" style={{ maxWidth: "none" }}>
                    <Search size={16} aria-hidden="true" />
                    <input className="a-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por nome ou NIF" aria-label="Procurar cliente" />
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }} role="listbox" aria-label="Clientes">
                    {filtered.length ? (
                      filtered.slice(0, 200).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={c.id === customerId}
                          onClick={() => {
                            setCustomerId(c.id);
                            setPicking(false);
                          }}
                          style={{
                            display: "flex",
                            width: "100%",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            border: 0,
                            borderBottom: "1px solid var(--line)",
                            background: c.id === customerId ? "var(--accent-soft)" : "transparent",
                            color: "inherit",
                            font: "inherit",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ fontWeight: c.id === customerId ? 650 : 500 }}>{c.fullName}</span>
                          <span className="muted num">{c.nif ? `NIF ${c.nif}` : ""}</span>
                        </button>
                      ))
                    ) : (
                      <div className="a-empty">
                        <strong>Nenhum cliente encontrado.</strong>
                        {canCreateCustomer && (
                          <button type="button" className="a-btn a-btn-sm" onClick={() => setMode("new")}>
                            <UserPlus size={15} /> Criar novo cliente
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {customerId && (
                    <div>
                      <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setPicking(false)}>
                        Manter {buyer?.fullName || selected?.fullName}
                      </button>
                    </div>
                  )}
                </>
              )}
              {errors.customerId && <span className="a-error" style={{ color: "var(--danger)", fontSize: 13 }}>{errors.customerId}</span>}
            </>
          ) : (
            <>
              <AiReader
                mode="person"
                target={{ ownerType: "none", kind: "identificacao" }}
                fields={NEW_FIELDS}
                current={newC}
                onApply={(found) => {
                  setNewC((v) => ({ ...v, ...found }));
                  setSuggested((s) => new Set([...s, ...Object.keys(found)]));
                }}
                onUploaded={(ids) => setAttach((a) => [...a, ...ids])}
                intro="Fotografe o Cartão de Cidadão (frente e verso) e, se precisar, um comprovativo de morada."
              />
              <div className="a-fields">
                {nf("fullName", "Nome completo *", { required: true }, true)}
                {nf("nif", "NIF", { inputMode: "numeric", maxLength: 11 })}
                {nf("idDocumentType", "Tipo de documento")}
                {nf("idDocumentNumber", "Nº do documento")}
                {nf("idDocumentExpiry", "Validade", { type: "date" })}
                {nf("birthDate", "Data de nascimento", { type: "date" })}
                {nf("drivingLicenseNumber", "Nº da carta de condução")}
                {nf("drivingLicenseIssuedAt", "Emissão da carta", { type: "date" })}
                {nf("address", "Morada", {}, true)}
                {nf("postalCode", "Código postal", { placeholder: "0000-000" })}
                {nf("city", "Localidade")}
                {nf("phone", "Telefone", { type: "tel" })}
                {nf("email", "E-mail", { type: "email" })}
              </div>
              <div className="a-actions">
                <button type="button" className="a-btn a-btn-primary" onClick={createNew} disabled={pending || !newC.fullName?.trim()}>
                  {pending ? <Spinner /> : <UserPlus size={16} />} Criar cliente e usar como {who}
                </button>
                {attach.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{attach.length} documento(s) ficam na ficha do cliente.</span>}
              </div>
            </>
          )}
        </div>
      </section>

      {isRent ? (
        <section className="a-card">
          <div className="a-card-head">
            <div>
              <h2>2. Dados do aluguer</h2>
              <p>Prazo, quilometragem e valor que vão para o contrato de locação.</p>
            </div>
          </div>
          <div className="a-card-body a-fields">
            <Field label="Início (dia)" name="r-start">
              <input id="f-r-start" type="date" value={rental.startDate} onChange={(e) => setRental((r) => ({ ...r, startDate: e.target.value }))} />
            </Field>
            <Field label="Início (hora)" name="r-start-time">
              <input id="f-r-start-time" type="time" value={rental.startTime} onChange={(e) => setRental((r) => ({ ...r, startTime: e.target.value }))} />
            </Field>
            <Field label="Termo (dia)" name="r-end" error={errors.rental}>
              <input id="f-r-end" type="date" value={rental.endDate} onChange={(e) => setRental((r) => ({ ...r, endDate: e.target.value }))} />
            </Field>
            <Field label="Termo (hora)" name="r-end-time">
              <input id="f-r-end-time" type="time" value={rental.endTime} onChange={(e) => setRental((r) => ({ ...r, endTime: e.target.value }))} />
            </Field>
            <Field label="Quilometragem atual" name="r-km">
              <input id="f-r-km" inputMode="numeric" value={rental.kmOut} onChange={(e) => setRental((r) => ({ ...r, kmOut: e.target.value }))} />
            </Field>
            <Field label="Valor total / renda (€)" name="r-total">
              <input id="f-r-total" inputMode="decimal" value={rental.totalEur} onChange={(e) => setRental((r) => ({ ...r, totalEur: e.target.value }))} placeholder="ex.: 525" />
            </Field>
            <Field label="Forma de pagamento" name="r-pay" wide>
              <input id="f-r-pay" value={rental.paymentMethod} onChange={(e) => setRental((r) => ({ ...r, paymentMethod: e.target.value }))} />
            </Field>
            <Field label="Localidade" name="sale-place" hint="Por omissão, a da empresa.">
              <input id="f-sale-place" value={sale.place} onChange={(e) => setSale((s) => ({ ...s, place: e.target.value }))} />
            </Field>
          </div>
        </section>
      ) : (
        <section className="a-card">
          <div className="a-card-head">
            <div>
              <h2>2. Dados da venda</h2>
              <p>Os dados da viatura já estão preenchidos a partir da ficha.</p>
            </div>
          </div>
          <div className="a-card-body a-fields">
            <Field label="Preço de venda (€) *" name="sale-price" error={errors.priceEur}>
              <input id="f-sale-price" inputMode="decimal" value={sale.priceEur} onChange={(e) => setSale((s) => ({ ...s, priceEur: e.target.value }))} />
            </Field>
            <Field label="Data da venda e entrega" name="sale-date" error={errors.date}>
              <input id="f-sale-date" type="date" value={sale.date} onChange={(e) => setSale((s) => ({ ...s, date: e.target.value }))} />
            </Field>
            <Field label="Km na entrega" name="sale-km">
              <input id="f-sale-km" inputMode="numeric" value={sale.km} onChange={(e) => setSale((s) => ({ ...s, km: e.target.value }))} />
            </Field>
            <Field label="Localidade" name="sale-place" hint="Por omissão, a da empresa.">
              <input id="f-sale-place" value={sale.place} onChange={(e) => setSale((s) => ({ ...s, place: e.target.value }))} />
            </Field>
            <Field label="Prazo da garantia (meses)" name="w-months">
              <input id="f-w-months" inputMode="numeric" value={warranty.months} onChange={(e) => setWarranty((w) => ({ ...w, months: e.target.value }))} />
            </Field>
            <Field label="Nº da garantia" name="w-number">
              <input id="f-w-number" value={warranty.number} onChange={(e) => setWarranty((w) => ({ ...w, number: e.target.value }))} />
            </Field>
            <Field label="Complementos e opções da garantia" name="w-extras" wide>
              <input id="f-w-extras" value={warranty.extras} onChange={(e) => setWarranty((w) => ({ ...w, extras: e.target.value }))} />
            </Field>
          </div>
        </section>
      )}

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>3. Documentos</h2>
            <p>Gerados já preenchidos com a viatura, o {who} e a empresa. Saem em PDF; os modelos trocam-se em Configurações → Modelos.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 10 }}>
          {documents.map((d) => (
            <label key={d.id} className="a-check">
              <input
                type="checkbox"
                checked={docs.has(d.id)}
                onChange={(e) => {
                  const next = new Set(docs);
                  if (e.target.checked) next.add(d.id);
                  else next.delete(d.id);
                  setDocs(next);
                }}
              />
              <span>
                <strong style={{ fontWeight: 600 }}>{d.title}</strong>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>
                  {d.description}
                </span>
              </span>
            </label>
          ))}
          {withConsignment && (
            <div className="a-consign">
              <AiReader
                mode="vehicle"
                target={{ ownerType: "none", kind: "dua" }}
                fields={CONSIGNMENT_FIELDS}
                current={consignment}
                onApply={(found) => setConsignment((c) => ({ ...c, ...found }))}
                title="Carro em consignação"
                idSuffix="-consignacao"
                intro="O carro que o cliente deixa no stand para vendermos. Fotografe o DUA para preencher a viatura, ou escreva abaixo."
              />
              <div className="a-fields">
                {CONSIGNMENT_INPUTS.map(([k, label, props, wide]) => (
                  <Field key={k} label={label} name={`cs-${k}`} wide={wide} hint={k === "price" ? (consignmentPrice ? eurosPorExtenso(consignmentPrice) : "Vai também por extenso no contrato.") : undefined}>
                    <input
                      id={`f-cs-${k}`}
                      value={consignment[k] ?? ""}
                      onChange={(e) => setConsignment((c) => ({ ...c, [k]: k === "plate" || k === "vin" || k === "iban" ? e.target.value.toUpperCase() : e.target.value }))}
                      {...props}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}
          {!isRent && canMarkSold && (
            <label className="a-check" style={{ marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <input type="checkbox" checked={markSold} onChange={(e) => setMarkSold(e.target.checked)} />
              <span>
                <strong style={{ fontWeight: 600 }}>Marcar a viatura como vendida</strong>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>
                  Associa o comprador, regista preço e data e, no site, passa a “Vendido”.
                </span>
              </span>
            </label>
          )}
        </div>
        <div className="a-form-foot" style={{ margin: 0 }}>
          <button type="button" className="a-btn a-btn-primary" onClick={prepare} disabled={pending || !customerId || !docs.size}>
            {pending && !review ? <Spinner /> : <ClipboardCheck size={16} />} Rever dados do contrato
          </button>
          {!customerId && <span className="muted" style={{ fontSize: 13 }}>Escolha ou crie o {who} primeiro.</span>}
        </div>
      </section>

      {review && (
        <section className="a-card" id="dados-contrato">
          <div className="a-card-head">
            <div>
              <h2>4. Dados do contrato</h2>
              <p>Tudo o que vai aparecer nos documentos. Confira, corrija e complete o que falta — só depois se gera.</p>
            </div>
            {missing.length > 0 ? <span className="a-pill danger">{missing.length} por preencher</span> : <span className="a-pill available">Completo</span>}
          </div>
          <div className="a-card-body" style={{ display: "grid", gap: 20 }}>
            <ContractFields fields={review} edited={edited} onEdit={(patch) => setEdited((x) => ({ ...x, ...patch }))} errors={errors} />
            <label className="a-check">
              <input type="checkbox" checked={saveToRecords} onChange={(e) => setSaveToRecords(e.target.checked)} />
              <span>
                Guardar o que completar aqui na ficha do cliente, na viatura e nos dados da empresa
                <span className="muted" style={{ display: "block", fontSize: 13 }}>Assim não é preciso voltar a escrever da próxima vez.</span>
              </span>
            </label>
          </div>
          <div className="a-form-foot" style={{ margin: 0 }}>
            <button type="button" className="a-btn a-btn-primary" onClick={submit} disabled={pending || missing.length > 0}>
              {pending ? <Spinner /> : <CheckCircle2 size={16} />} {isRent ? "Registar aluguer e gerar contrato" : markSold ? "Registar venda e gerar documentos" : "Gerar documentos"}
            </button>
            {missing.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Falta preencher: {missing.map((f) => f.label).join(", ")}.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
