"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, CheckCircle2, ClipboardCheck, FileDown, FilePlus2, FileSignature, Search, Stamp, X } from "lucide-react";
import { declarationVehicle, generateDeclaration, reviewDeclaration } from "@/app/painel/_actions/declarations";
import { dealCustomer } from "@/app/painel/_actions/sales";
import type { ContractField } from "@/lib/contract-fields";
import { eurosPorExtenso, parseEuros } from "@/lib/extenso";
import type { TemplateId } from "@/lib/form-templates";
import { AiReader, type FieldMeta } from "./ai-reader";
import { ContractFields } from "./contract-fields";
import { GeneratedHistory, type GeneratedRow } from "./form-generator";
import { Alert, Field, Spinner, useAction } from "./ui";

export type DeclarationDoc = { id: TemplateId; title: string; description: string; mode: "sale" | "rent" | "any"; fields: string[] };
type Option = { id: string; label: string };

/** Cada campo do formulário e os campos {{...}} do documento que alimenta (só aparece se o documento o usa). */
type Input = { key: string; label: string; feeds: string[]; type?: "date" | "time" | "select"; options?: [string, string][]; wide?: boolean; numeric?: boolean; placeholder?: string };

const CUSTOMER_INPUTS: Input[] = [
  { key: "fullName", label: "Nome completo", feeds: ["cliente.nome"], wide: true },
  { key: "nif", label: "NIF", feeds: ["cliente.nif"], numeric: true },
  { key: "idDocumentType", label: "Tipo de documento", feeds: ["cliente.documento"], placeholder: "Cartão de Cidadão" },
  { key: "idDocumentNumber", label: "Nº do documento", feeds: ["cliente.documento", "cliente.numero_documento"] },
  { key: "idDocumentExpiry", label: "Válido até", feeds: ["cliente.validade_documento"], type: "date" },
  { key: "birthDate", label: "Data de nascimento", feeds: ["cliente.nascimento"], type: "date" },
  { key: "nationality", label: "Nacionalidade", feeds: ["cliente.nacionalidade"] },
  { key: "drivingLicenseNumber", label: "Nº da carta de condução", feeds: ["cliente.carta"] },
  { key: "drivingLicenseIssuedAt", label: "Emissão da carta", feeds: ["cliente.carta_emissao"], type: "date" },
  { key: "address", label: "Morada", feeds: ["cliente.morada", "cliente.morada_rua"], wide: true },
  { key: "postalCode", label: "Código postal", feeds: ["cliente.morada", "cliente.codigo_postal"], placeholder: "0000-000" },
  { key: "city", label: "Localidade", feeds: ["cliente.morada", "cliente.localidade"] },
  { key: "phone", label: "Telefone", feeds: ["cliente.telefone"] },
  { key: "email", label: "E-mail", feeds: ["cliente.email"] },
];

const VEHICLE_INPUTS: Input[] = [
  { key: "make", label: "Marca", feeds: ["viatura.marca", "viatura.marca_modelo", "consignacao.marca"] },
  { key: "model", label: "Modelo", feeds: ["viatura.modelo", "viatura.marca_modelo", "consignacao.modelo"] },
  { key: "version", label: "Versão", feeds: ["viatura.versao"] },
  { key: "plate", label: "Matrícula", feeds: ["viatura.matricula", "consignacao.matricula"], placeholder: "AA-00-BB" },
  { key: "vin", label: "Nº de quadro (VIN)", feeds: ["viatura.vin", "consignacao.vin"] },
  { key: "firstRegistration", label: "Data da 1.ª matrícula", feeds: ["viatura.primeira_matricula", "viatura.primeiro_registo"], type: "date" },
  { key: "year", label: "Ano", feeds: ["viatura.ano", "consignacao.ano"], numeric: true },
  { key: "mileageKm", label: "Quilómetros", feeds: ["viatura.km", "venda.km_entrega", "aluguer.km_saida", "consignacao.km"], numeric: true },
  { key: "color", label: "Cor", feeds: ["viatura.cor"] },
  { key: "fuel", label: "Combustível", feeds: ["viatura.combustivel"], type: "select", options: [["", "—"], ["petrol", "Gasolina"], ["diesel", "Gasóleo"], ["hybrid", "Híbrido"], ["electric", "Elétrico"]] },
  { key: "transmission", label: "Caixa", feeds: ["viatura.transmissao"], type: "select", options: [["", "—"], ["manual", "Manual"], ["automatic", "Automática"]] },
  { key: "engineCc", label: "Cilindrada (cm³)", feeds: ["viatura.cilindrada"], numeric: true },
  { key: "powerHp", label: "Potência (cv)", feeds: ["viatura.potencia_kw"], numeric: true },
  { key: "seats", label: "Lugares", feeds: ["viatura.lugares"], numeric: true },
];

const RENT_PAYMENT = "Pago por transferência bancária MBWAY/IBAN ou em dinheiro no ato da assinatura.";

const DEAL_INPUTS: Input[] = [
  { key: "price", label: "Preço (€)", feeds: ["venda.preco", "consignacao.preco_minimo", "consignacao.preco_extenso"], numeric: true },
  { key: "iban", label: "IBAN do cliente (para o pagamento)", feeds: ["consignacao.iban"], wide: true, placeholder: "PT50 …" },
  { key: "date", label: "Data", feeds: ["venda.data", "venda.data_extenso", "garantia.inicio", "garantia.fim", "garantia.entrega"], type: "date" },
  { key: "time", label: "Hora", feeds: ["venda.hora"], type: "time" },
  { key: "place", label: "Localidade", feeds: ["venda.local"], placeholder: "Por omissão, a da empresa" },
  { key: "warrantyMonths", label: "Prazo da garantia (meses)", feeds: ["garantia.prazo", "garantia.fim"], numeric: true },
  { key: "warrantyNumber", label: "Nº da garantia", feeds: ["garantia.numero"] },
  { key: "warrantyExtras", label: "Complementos e opções da garantia", feeds: ["garantia.complementos"], wide: true },
  { key: "startDate", label: "Início do aluguer", feeds: ["aluguer.inicio"], type: "date" },
  { key: "startTime", label: "Hora de início", feeds: ["aluguer.inicio_hora"], type: "time" },
  { key: "endDate", label: "Fim do aluguer", feeds: ["aluguer.fim"], type: "date" },
  { key: "endTime", label: "Hora de fim", feeds: ["aluguer.fim_hora"], type: "time" },
  { key: "totalEur", label: "Valor total / renda (€)", feeds: ["aluguer.valor"], numeric: true },
  { key: "paymentMethod", label: "Forma de pagamento", feeds: ["aluguer.forma_pagamento"], wide: true },
  { key: "notes", label: "Observações", feeds: ["venda.observacoes"], wide: true },
];

/** Ordem, etiqueta e texto curto dos cartões (cabem dois por linha no telemóvel). */
const CARDS: { id: TemplateId; tag: string; blurb: string }[] = [
  { id: "declaracao_circulacao", tag: "Venda", blurb: "Declaração de venda ao comprador; circula até sair o registo." },
  { id: "contrato_consignacao", tag: "Consignação", blurb: "O cliente deixa o carro no stand para vendermos." },
  { id: "termo_garantia", tag: "Venda", blurb: "Garantia entregue ao comprador." },
  { id: "dados_registo", tag: "Venda", blurb: "Vendedor, comprador e carro para o registo no IRN." },
  { id: "declaracao_compra", tag: "Compra", blurb: "Um particular vende-nos uma viatura." },
  { id: "contrato_locacao", tag: "Aluguer", blurb: "Locatário, carro, prazo e valor." },
  { id: "ficha_cliente", tag: "Cliente", blurb: "Dados do cliente para arquivo." },
];

const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
const emptyDeal = () => ({
  price: "", iban: "", date: today(), time: nowTime(), place: "", notes: "", warrantyMonths: "18", warrantyNumber: "", warrantyExtras: "",
  startDate: today(), startTime: "17:00", endDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10), endTime: "17:00", totalEur: "", paymentMethod: RENT_PAYMENT,
});
const emptyCustomer = (): Record<string, string> => ({ country: "Portugal" });
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s·]/g, "");
const num = (v: string) => {
  const n = Number(v.replace(/\D/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
};

/** Procurar e escolher um cliente ou viatura já registados (opcional). */
function Picker({ label, options, onPick }: { label: string; options: Option[]; onPick: (o: Option) => void }) {
  const [q, setQ] = useState("");
  const matches = q.trim().length >= 2 ? options.filter((o) => norm(o.label).includes(norm(q))).slice(0, 6) : [];
  return (
    <div className="a-picker">
      <div className="a-search" style={{ maxWidth: "none" }}>
        <Search size={16} aria-hidden="true" />
        <input className="a-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} aria-label={label} />
      </div>
      {matches.length > 0 && (
        <ul className="a-picker-list">
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(o);
                  setQ("");
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !matches.length && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nada encontrado — preencha com as fotos ou à mão.</p>}
    </div>
  );
}

export function Declarations({
  docs,
  customers,
  vehicles,
  history,
  initial,
}: {
  docs: DeclarationDoc[];
  customers: Option[];
  vehicles: Option[];
  history: GeneratedRow[];
  initial: TemplateId | null;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [selected, setSelected] = useState<TemplateId | null>(initial && docs.some((d) => d.id === initial) ? initial : null);
  const [customer, setCustomer] = useState<Record<string, string>>(emptyCustomer);
  const [customerLink, setCustomerLink] = useState<Option | null>(null);
  const [vehicle, setVehicle] = useState<Record<string, string>>({});
  const [vehicleLink, setVehicleLink] = useState<Option | null>(null);
  const [deal, setDeal] = useState<Record<string, string>>(emptyDeal);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<ContractField[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ title: string; url: string; format: "docx" | "pdf" } | null>(null);
  const [loadingLink, setLoadingLink] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const doc = docs.find((d) => d.id === selected) ?? null;
  const uses = (i: Input) => Boolean(doc && i.feeds.some((f) => doc.fields.includes(f)));
  const customerInputs = CUSTOMER_INPUTS.filter(uses);
  const vehicleInputs = VEHICLE_INPUTS.filter(uses);
  const dealInputs = DEAL_INPUTS.filter(uses);
  const isConsignment = selected === "contrato_consignacao";
  const isRent = doc?.mode === "rent";
  const priceLabel = isConsignment ? "Preço mínimo de venda (€)" : selected === "declaracao_compra" ? "Preço de compra (€)" : "Preço de venda (€)";
  const customerTitle = isRent ? "Locatário" : selected === "declaracao_compra" ? "Cliente (quem vende o carro ao stand)" : isConsignment ? "Consignante (dono do carro)" : selected === "ficha_cliente" ? "Cliente" : "Comprador";
  const vehicleTitle = isConsignment ? "Carro em consignação" : "Viatura";

  // Qualquer alteração obriga a rever de novo antes de gerar.
  const formKey = JSON.stringify([selected, customer, vehicle, deal, customerLink?.id, vehicleLink?.id]);
  useEffect(() => {
    setReview(null);
    setEdited({});
  }, [formKey]);

  function choose(id: TemplateId) {
    setSelected(id);
    setDone(null);
    window.history.replaceState(null, "", `/painel/declaracoes?doc=${id}`);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function clearAll() {
    setCustomer(emptyCustomer());
    setCustomerLink(null);
    setVehicle({});
    setVehicleLink(null);
    setDeal(emptyDeal());
    setSuggested(new Set());
    setDone(null);
  }

  const unsuggest = (k: string) => setSuggested((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));

  async function pickCustomer(o: Option) {
    setLoadingLink("c");
    const res = await run(() => dealCustomer(o.id), { quiet: true });
    setLoadingLink(null);
    if (!res.ok) return;
    setCustomer({ ...emptyCustomer(), ...Object.fromEntries(Object.entries(res.data).filter(([, v]) => v)) });
    setCustomerLink(o);
  }

  async function pickVehicle(o: Option) {
    setLoadingLink("v");
    const res = await run(() => declarationVehicle(o.id), { quiet: true });
    setLoadingLink(null);
    if (!res.ok) return;
    setVehicle(Object.fromEntries(Object.entries(res.data).filter(([, v]) => v)));
    setVehicleLink(o);
  }

  const payload = () => ({
    template: selected!,
    customerId: customerLink?.id ?? null,
    vehicleId: vehicleLink?.id ?? null,
    customer: Object.fromEntries(CUSTOMER_INPUTS.map((i) => [i.key, customer[i.key] ?? ""]).concat([["country", customer.country ?? ""]])),
    vehicle: {
      make: vehicle.make ?? "", model: vehicle.model ?? "", version: vehicle.version ?? "", plate: vehicle.plate ?? "", vin: vehicle.vin ?? "",
      firstRegistration: vehicle.firstRegistration ?? "", year: num(vehicle.year ?? ""), mileageKm: num(vehicle.mileageKm ?? ""), color: vehicle.color ?? "",
      fuel: vehicle.fuel ?? "", transmission: vehicle.transmission ?? "", engineCc: num(vehicle.engineCc ?? ""), powerHp: num(vehicle.powerHp ?? ""), seats: num(vehicle.seats ?? ""),
    },
    deal: {
      priceEur: parseEuros(deal.price),
      date: deal.date || today(),
      time: deal.time,
      place: deal.place,
      notes: deal.notes,
      warrantyMonths: num(deal.warrantyMonths),
      warrantyNumber: deal.warrantyNumber,
      warrantyExtras: deal.warrantyExtras,
      iban: deal.iban,
      ...(isRent
        ? { rental: { startDate: deal.startDate, startTime: deal.startTime, endDate: deal.endDate, endTime: deal.endTime, totalEur: parseEuros(deal.totalEur), paymentMethod: deal.paymentMethod } }
        : {}),
    },
  });

  async function prepare() {
    const res = await run(() => reviewDeclaration(payload()), { quiet: true });
    if (res.ok) {
      setReview(res.data.fields);
      setEdited({});
      requestAnimationFrame(() => document.getElementById("dados-documento")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const valueOf = (f: ContractField) => edited[f.key] ?? f.value;
  const missing = review ? review.filter((f) => f.required && !valueOf(f).trim()) : [];

  async function generate() {
    if (!review) return;
    const res = await run(() => generateDeclaration(payload(), Object.fromEntries(review.map((f) => [f.key, valueOf(f)]))));
    if (res.ok) {
      setDone(res.data);
      router.refresh();
      requestAnimationFrame(() => document.getElementById("documento-pronto")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    }
  }

  const input = (prefix: "c" | "v" | "d", i: Input, values: Record<string, string>, set: (fn: (v: Record<string, string>) => Record<string, string>) => void) => {
    const id = `${prefix}-${i.key}`;
    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = i.key === "plate" || i.key === "iban" || i.key === "vin" ? e.target.value.toUpperCase() : e.target.value;
      set((v) => ({ ...v, [i.key]: value }));
      unsuggest(`${prefix}.${i.key}`);
    };
    const price = prefix === "d" && i.key === "price" ? parseEuros(values.price ?? "") : null;
    return (
      <Field
        key={id}
        label={prefix === "d" && i.key === "price" ? priceLabel : i.label}
        name={id}
        wide={i.wide}
        suggested={suggested.has(`${prefix}.${i.key}`)}
        hint={isConsignment && price ? eurosPorExtenso(price) : prefix === "d" && i.key === "place" ? "Por omissão, a localidade da empresa." : undefined}
      >
        {i.type === "select" ? (
          <select id={`f-${id}`} value={values[i.key] ?? ""} onChange={onChange}>
            {i.options!.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`f-${id}`}
            type={i.type ?? "text"}
            inputMode={i.numeric ? "decimal" : undefined}
            value={values[i.key] ?? ""}
            onChange={onChange}
            placeholder={i.key === "place" ? "" : i.placeholder}
          />
        )}
      </Field>
    );
  };

  // A caixa única de fotos lê o cliente (c.) e a viatura (v.) ao mesmo tempo.
  const aiFields: FieldMeta[] = [
    ...customerInputs.filter((i) => i.key !== "phone" && i.key !== "email").map((i) => ({ key: `c.${i.key}`, label: i.label, important: ["fullName", "nif", "idDocumentNumber", "address"].includes(i.key) })),
    ...vehicleInputs.map((i) => ({ key: `v.${i.key}`, label: i.label, important: ["make", "model", "plate"].includes(i.key) })),
  ];
  const aiCurrent = {
    ...Object.fromEntries(Object.entries(customer).map(([k, v]) => [`c.${k}`, v])),
    ...Object.fromEntries(Object.entries(vehicle).map(([k, v]) => [`v.${k}`, v])),
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="a-card a-card-pad" aria-labelledby="escolher-doc">
        <h2 id="escolher-doc" className="a-section-title" style={{ margin: "0 0 12px" }}>
          Que documento quer fazer?
        </h2>
        <div className="a-decl-grid">
          {CARDS.map(({ id, tag, blurb }) => {
            const d = docs.find((x) => x.id === id);
            if (!d) return null;
            return (
              <button key={id} type="button" className="a-decl-card" aria-pressed={selected === id} onClick={() => choose(id)}>
                <span className="a-decl-tag">{tag}</span>
                <strong>{d.title}</strong>
                <small>{blurb}</small>
              </button>
            );
          })}
          <Link href="/painel/registo" className="a-decl-card">
            <span className="a-decl-tag">
              <ArrowLeftRight size={12} /> Página própria
            </span>
            <strong>Requerimento de Registo Automóvel</strong>
            <small>Compra e venda no IRN, com as fotos das duas pessoas.</small>
          </Link>
          <Link href="/painel/legalizacao" className="a-decl-card">
            <span className="a-decl-tag">
              <Stamp size={12} /> Página própria
            </span>
            <strong>Legalização (Modelo 9, DAV, registo inicial)</strong>
            <small>Carros importados: do livrete estrangeiro à matrícula portuguesa.</small>
          </Link>
        </div>
      </section>

      {doc && (
        <div ref={formRef} style={{ display: "grid", gap: 20, scrollMarginTop: 16 }}>
          <div className="a-decl-head">
            <div>
              <span className="muted" style={{ fontSize: 13 }}>
                A preencher
              </span>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <FileSignature size={18} aria-hidden="true" /> {doc.title}
              </h2>
            </div>
            <div className="a-actions">
              <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={clearAll}>
                <X size={15} /> Limpar dados
              </button>
              <button
                type="button"
                className="a-btn a-btn-sm"
                onClick={() => {
                  setSelected(null);
                  window.history.replaceState(null, "", "/painel/declaracoes");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <ArrowLeft size={15} /> Outro documento
              </button>
            </div>
          </div>

          <AiReader
            mode="declaration"
            target={{ ownerType: "none", kind: "outro" }}
            fields={aiFields}
            current={aiCurrent}
            onApply={(found) => {
              const c: Record<string, string> = {};
              const v: Record<string, string> = {};
              for (const [k, val] of Object.entries(found)) (k.startsWith("c.") ? c : v)[k.slice(2)] = val;
              if (Object.keys(c).length) setCustomer((x) => ({ ...x, ...c }));
              if (Object.keys(v).length) setVehicle((x) => ({ ...x, ...v }));
              setSuggested((s) => new Set([...s, ...Object.keys(found)]));
            }}
            title="Fotografias dos documentos"
            intro={
              vehicleInputs.length
                ? `Junte o Cartão de Cidadão do cliente (frente e verso) e o documento único (DUA) ${isConsignment ? "do carro em consignação" : "da viatura"}. A IA preenche tudo abaixo.`
                : "Junte o Cartão de Cidadão do cliente (frente e verso) e, se precisar, um comprovativo de morada. A IA preenche tudo abaixo."
            }
          />

          {customerInputs.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <div>
                  <h2>{customerTitle}</h2>
                  <p>Das fotografias, de um cliente já registado ou à mão.</p>
                </div>
              </div>
              <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
                {customerLink ? (
                  <p className="a-decl-link">
                    Ficha: <strong>{customerLink.label}</strong>
                    <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setCustomerLink(null)}>
                      Desligar
                    </button>
                  </p>
                ) : (
                  customers.length > 0 && <Picker label="Procurar cliente registado (opcional)" options={customers} onPick={pickCustomer} />
                )}
                {loadingLink === "c" && (
                  <p className="muted" style={{ margin: 0 }}>
                    <Spinner /> A carregar a ficha…
                  </p>
                )}
                <div className="a-fields">{customerInputs.map((i) => input("c", i, customer, setCustomer))}</div>
              </div>
            </section>
          )}

          {vehicleInputs.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <div>
                  <h2>{vehicleTitle}</h2>
                  <p>{isConsignment ? "O carro que o cliente deixa no stand para vendermos." : "Das fotografias, de uma viatura já registada ou à mão."}</p>
                </div>
              </div>
              <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
                {vehicleLink ? (
                  <p className="a-decl-link">
                    Viatura: <strong>{vehicleLink.label}</strong>
                    <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setVehicleLink(null)}>
                      Desligar
                    </button>
                  </p>
                ) : (
                  !isConsignment && vehicles.length > 0 && <Picker label="Procurar viatura registada (opcional)" options={vehicles} onPick={pickVehicle} />
                )}
                {loadingLink === "v" && (
                  <p className="muted" style={{ margin: 0 }}>
                    <Spinner /> A carregar a viatura…
                  </p>
                )}
                <div className="a-fields">{vehicleInputs.map((i) => input("v", i, vehicle, setVehicle))}</div>
              </div>
            </section>
          )}

          {dealInputs.length > 0 && (
            <section className="a-card">
              <div className="a-card-head">
                <div>
                  <h2>{isRent ? "Aluguer" : isConsignment ? "Preço, pagamento e data" : "Dados do documento"}</h2>
                </div>
              </div>
              <div className="a-card-body">
                <div className="a-fields">{dealInputs.map((i) => input("d", i, deal, setDeal))}</div>
              </div>
            </section>
          )}

          <div className="a-actions">
            <button type="button" className="a-btn a-btn-primary" onClick={prepare} disabled={pending}>
              {pending && !review ? <Spinner /> : <ClipboardCheck size={16} />} Rever dados do documento
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Mostra tudo o que vai sair no documento, para conferir antes de gerar.
            </span>
          </div>

          {review && (
            <section className="a-card" id="dados-documento" style={{ scrollMarginTop: 16 }}>
              <div className="a-card-head">
                <div>
                  <h2>Dados do documento</h2>
                  <p>Confira e complete. Só se gera com tudo preenchido.</p>
                </div>
                {missing.length > 0 ? <span className="a-pill danger">{missing.length} por preencher</span> : <span className="a-pill available">Completo</span>}
              </div>
              <div className="a-card-body" style={{ display: "grid", gap: 20 }}>
                <ContractFields fields={review} edited={edited} onEdit={(patch) => setEdited((x) => ({ ...x, ...patch }))} errors={errors} />
              </div>
              <div className="a-form-foot" style={{ margin: 0 }}>
                <button type="button" className="a-btn a-btn-primary" onClick={generate} disabled={pending || missing.length > 0}>
                  {pending ? <Spinner /> : <CheckCircle2 size={16} />} Gerar documento
                </button>
                {missing.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Falta preencher: {missing.map((f) => f.label).join(", ")}.</span>}
              </div>
            </section>
          )}

          {done && (
            <section className="a-card a-card-pad" id="documento-pronto" style={{ display: "grid", gap: 14 }}>
              <Alert kind="ok" title={`Documento pronto: ${done.title}`}>
                <p>Abra, confira e imprima para assinar. Fica guardado em “Documentos gerados”, mais abaixo.</p>
              </Alert>
              <div className="a-actions">
                <a className="a-btn a-btn-primary" href={done.url} target="_blank" rel="noopener">
                  <FileDown size={16} /> Abrir {done.format === "docx" ? "(Word)" : "(PDF)"}
                </a>
                <button
                  type="button"
                  className="a-btn"
                  onClick={() => {
                    clearAll();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <FilePlus2 size={16} /> Fazer outra
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      <GeneratedHistory history={history} />
    </div>
  );
}
