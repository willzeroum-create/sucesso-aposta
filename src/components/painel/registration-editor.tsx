"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, ArrowRight, Building2, CheckCircle2, ClipboardCheck, FileDown, FilePlus2, FileText, Trash2, User, UserCheck, UserPlus, X } from "lucide-react";
import { declarationVehicle, reviewDeclaration } from "@/app/painel/_actions/declarations";
import {
  deleteRegistration,
  generateRegistration,
  generateRegistrationDocs,
  saveRegistration,
  startVehicleRegistration,
  type RegistrationPatch,
} from "@/app/painel/_actions/registrations";
import { dealCustomer } from "@/app/painel/_actions/sales";
import type { ContractField } from "@/lib/contract-fields";
import type { TemplateId } from "@/lib/form-templates";
import {
  defaultIssuer,
  DOC_TYPE_LABEL,
  docTypeFrom,
  emptyParty,
  parseEurosText,
  PARTY_FIELDS,
  paymentPending,
  REGISTRATION_DOCS,
  REGISTRATION_STATUS,
  registrationMissing,
  VEHICLE_FIELDS_RA,
  type PartyDocType,
  type RegistrationDoc,
  type RegistrationParty,
  type RegistrationPayment,
  type RegistrationStatus,
  type RegistrationVehicle,
} from "@/lib/registo";
import { AiReader } from "./ai-reader";
import { ContractFields } from "./contract-fields";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

type Option = { id: string; label: string };
type StockVehicle = Option & { plate: string; make: string; model: string; vin: string };
type CompanyPreset = { key: string; label: string; party: RegistrationParty };
type Role = "buyer" | "seller";
type DocOption = { id: TemplateId; title: string; description: string };
/** Revisão dos documentos de um dos lados (comprador ou vendedor é o "cliente" do documento). */
type DocReview = { client: Role; ids: TemplateId[]; fields: ContractField[]; inputs: Partial<Record<TemplateId, Record<string, unknown>>> };

const FUELS = ["petrol", "diesel", "hybrid", "electric"];
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
const whenPt = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });

/** Contraente → cliente do documento (o mesmo formato das Declarações). */
const docCustomer = (p: RegistrationParty) => {
  const person = p.kind === "particular";
  return {
    fullName: p.name,
    nif: p.nif,
    idDocumentType: person && p.docNumber.trim() ? (p.docType === "outro" ? p.docTypeOther : DOC_TYPE_LABEL[p.docType]) : "",
    idDocumentNumber: person ? p.docNumber : "",
    idDocumentExpiry: person ? p.docExpiry : "",
    birthDate: "",
    nationality: "",
    drivingLicenseNumber: "",
    drivingLicenseIssuedAt: "",
    address: p.address,
    postalCode: p.postalCode,
    city: p.city,
    country: "",
    phone: "",
    email: p.email,
  };
};
const BLANK_CAR = { make: "", model: "", version: "", plate: "", vin: "", firstRegistration: "", year: null, mileageKm: null, color: "", fuel: "", transmission: "", engineCc: null, powerHp: null, seats: null };

/** Separador "Venda" da ficha do carro sem compra e venda: começa uma ligada a este carro. */
export function StartVehicleRegistration({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <button
      type="button"
      className="a-btn a-btn-primary"
      disabled={pending}
      onClick={async () => {
        if ((await run(() => startVehicleRegistration(vehicleId), { quiet: true })).ok) router.refresh();
      }}
    >
      {pending ? <Spinner /> : <FilePlus2 size={16} />} Começar a compra e venda
    </button>
  );
}

/** Pessoa lida pela IA → dados completos de um contraente (substitui o que lá estava). */
function partyFromRead(found: Record<string, string>): RegistrationParty {
  const kind = found.kind === "empresa" ? "empresa" : "particular";
  const p = { ...emptyParty(kind), ...found, kind } as RegistrationParty;
  if (found.docTypeOther && !found.docType) p.docType = "outro";
  if (!["cc", "bi", "cp", "outro"].includes(p.docType)) p.docType = "cc";
  if (!p.docIssuer && kind === "particular") p.docIssuer = defaultIssuer(p);
  return p;
}
const ROLE: Record<Role, { title: string; hint: string; tone: string }> = {
  buyer: { title: "Comprador", hint: "Sujeito ativo (Q3) — quem fica com o carro", tone: "var(--ok)" },
  seller: { title: "Vendedor", hint: "Sujeito passivo (Q4) — quem vende", tone: "var(--accent, #641e2c)" },
};

export function RegistrationEditor({
  id,
  initial,
  canCharge,
  canMarkSold,
  vehicleSold,
  vehicles,
  customers,
  companies,
  docOptions,
  pdfUrl: initialPdf,
  embedded = false,
}: {
  id: string;
  initial: {
    buyer: RegistrationParty;
    seller: RegistrationParty;
    vehicle: RegistrationVehicle;
    contractDate: string;
    vehicleId: string | null;
    status: RegistrationStatus;
    notes: string;
    payment: RegistrationPayment;
    guarantor: RegistrationParty | null;
    docs: RegistrationDoc[];
  };
  /** Pode criar vendas a prestações (Cobranças). */
  canCharge: boolean;
  /** Pode marcar a viatura do stock como vendida. */
  canMarkSold: boolean;
  /** A viatura do stock ligada já está vendida. */
  vehicleSold: boolean;
  vehicles: StockVehicle[];
  customers: Option[];
  companies: CompanyPreset[];
  /** Documentos da venda que se podem gerar no fim (parte 7). */
  docOptions: DocOption[];
  pdfUrl: string | null;
  /** Dentro do separador "Venda" da ficha do carro (ao apagar fica na ficha). */
  embedded?: boolean;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [buyer, setBuyer] = useState(initial.buyer);
  const [seller, setSeller] = useState(initial.seller);
  const [vehicle, setVehicle] = useState(initial.vehicle);
  const [contractDate, setContractDate] = useState(initial.contractDate);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId ?? "");
  const [status, setStatus] = useState(initial.status);
  const [notes, setNotes] = useState(initial.notes);
  const [payment, setPayment] = useState(initial.payment);
  /** Fiador / 2.º titular: só para o contrato das Cobranças, nunca para o requerimento. */
  const [guarantor, setGuarantor] = useState(initial.guarantor);
  const [pdfUrl, setPdfUrl] = useState(initialPdf);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Pessoas lidas nos documentos, à espera de se dizer quem é o comprador. */
  const [people, setPeople] = useState<RegistrationParty[] | null>(null);
  /** Proprietário escrito no documento do carro (normalmente o vendedor). */
  const [carOwner, setCarOwner] = useState("");

  // Grava sozinho pouco depois de cada alteração.
  const snapshot = useMemo(
    () => JSON.stringify({ buyer, seller, vehicle, contractDate, vehicleId, status, notes, payment, guarantor }),
    [buyer, seller, vehicle, contractDate, vehicleId, status, notes, payment, guarantor],
  );
  const lastSaved = useRef(snapshot);
  const save = useCallback(
    async (patch: RegistrationPatch) => {
      setSaveState("saving");
      const res = await saveRegistration(id, patch).catch(() => null);
      setSaveState(res?.ok ? "saved" : "error");
      return Boolean(res?.ok);
    },
    [id],
  );
  const flush = useCallback(async () => {
    if (snapshot === lastSaved.current) return true;
    const ok = await save({
      buyer: { ...buyer } as Record<string, string>,
      seller: { ...seller } as Record<string, string>,
      vehicle: { ...vehicle } as Record<string, string>,
      contractDate,
      vehicleId: vehicleId || null,
      status,
      notes,
      payment: (({ chargeId: _c, ...p }) => p)(payment),
      guarantor: guarantor ? ({ ...guarantor } as Record<string, string>) : null,
    });
    if (ok) lastSaved.current = snapshot;
    return ok;
  }, [snapshot, save, buyer, seller, vehicle, contractDate, vehicleId, status, notes, payment, guarantor]);
  useEffect(() => {
    if (snapshot === lastSaved.current) return;
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [snapshot, flush]);

  const missing = registrationMissing(buyer, seller, vehicle, contractDate);
  const setParty = (role: Role) => (role === "buyer" ? setBuyer : setSeller);

  /** Com 2 pessoas: a escolhida é o comprador e a outra o vendedor. Com 1: vai para o papel escolhido. */
  function assign(buyerIndex: number | null, sellerIndex: number | null) {
    if (!people) return;
    if (buyerIndex !== null) setBuyer(people[buyerIndex]);
    if (sellerIndex !== null) setSeller(people[sellerIndex]);
    setPeople(null);
  }

  async function pickCustomer(role: Role, customerId: string) {
    if (!customerId) return;
    const res = await run(() => dealCustomer(customerId), { quiet: true });
    if (!res.ok) return;
    const c = res.data;
    const doc = docTypeFrom(c.idDocumentType);
    const party: RegistrationParty = {
      kind: "particular",
      name: c.fullName,
      nif: c.nif,
      docType: doc.docType,
      docTypeOther: doc.docTypeOther,
      docNumber: c.idDocumentNumber,
      docIssuer: "",
      docExpiry: c.idDocumentExpiry,
      certCode: "",
      address: c.address,
      postalCode: c.postalCode,
      city: c.city,
      email: c.email,
    };
    party.docIssuer = defaultIssuer(party);
    setParty(role)(party);
  }

  async function generate() {
    if (!(await flush())) return;
    const res = await run(() => generateRegistration(id));
    if (res.ok) {
      setPdfUrl(res.data.url);
      if (status === "draft") {
        setStatus("generated");
        lastSaved.current = JSON.stringify({ buyer, seller, vehicle, contractDate, vehicleId, status: "generated", notes, payment, guarantor });
      }
      window.open(res.data.url, "_blank", "noopener");
      router.refresh();
    }
  }

  const owed = paymentPending(payment);
  const eur = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
  const pay = (k: keyof RegistrationPayment, v: string) => setPayment((p) => ({ ...p, [k]: v }));
  const choice = (k: "owed" | "how" | "toCharges", label: string, options: [string, string][]) => (
    <div className="a-pay-q">
      <span>{label}</span>
      <div className="a-seg" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={payment[k] === v} onClick={() => pay(k, v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  /** As Cobranças abrem numa janela nova: esta fica aberta para continuar a preencher. */
  const chargesOpened = useRef(false);
  function openCharges() {
    const url = `/painel/cobrancas/nova?registo=${id}`;
    chargesOpened.current = true;
    if (snapshot === lastSaved.current) {
      window.open(url, "_blank", "noopener");
      return;
    }
    // Com alterações por gravar: a janela abre já no clique (senão o navegador bloqueia) e só recebe o
    // endereço depois de gravar.
    const win = window.open("", "_blank");
    void flush().then((ok) => {
      if (!ok) return win?.close();
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else window.open(url, "_blank");
    });
  }
  // Ao voltar a esta janela depois de abrir as Cobranças, vê se a venda a prestações já foi criada.
  useEffect(() => {
    const onFocus = () => chargesOpened.current && router.refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [router]);
  const linkedCharge = initial.payment.chargeId;
  useEffect(() => {
    if (linkedCharge) setPayment((p) => (p.chargeId === linkedCharge ? p : { ...p, owed: "sim", how: "prestacoes", toCharges: "sim", chargeId: linkedCharge }));
  }, [linkedCharge]);

  // 7. Declarações e documentos (o "3. Documentos" da ficha do carro).
  const standNifs = new Set(companies.map((c) => c.party.nif.replace(/\D/g, "")).filter(Boolean));
  const isStand = (p: RegistrationParty) => standNifs.has(p.nif.replace(/\D/g, ""));
  const standBuys = isStand(buyer);
  const [docSel, setDocSel] = useState<Set<TemplateId>>(
    () => new Set((isStand(initial.buyer) ? ["declaracao_compra"] : ["termo_garantia", "declaracao_circulacao"]).filter((d) => docOptions.some((o) => o.id === d)) as TemplateId[]),
  );
  const [km, setKm] = useState("");
  const [warranty, setWarranty] = useState("18");
  const canSell = Boolean(vehicleId) && canMarkSold && !standBuys;
  const [markSold, setMarkSold] = useState(Boolean(initial.vehicleId) && canMarkSold && !vehicleSold && !isStand(initial.buyer));
  const [docReview, setDocReview] = useState<DocReview[] | null>(null);
  const [docEdits, setDocEdits] = useState<Partial<Record<Role, Record<string, string>>>>({});
  const [docs, setDocs] = useState(initial.docs);
  const docValue = (g: DocReview, f: ContractField) => docEdits[g.client]?.[f.key] ?? f.value;
  const docMissing = (docReview ?? []).flatMap((g) => g.fields.filter((f) => f.required && !docValue(g, f).trim()));
  const sellNow = canSell && !vehicleSold && markSold;
  const docTitle = (tid: TemplateId) => docOptions.find((d) => d.id === tid)?.title ?? tid;

  async function reviewDocs() {
    if (!(await flush())) return;
    // A viatura do stock completa o que o processo não tem (versão, 1.ª matrícula, km…).
    let base: Record<string, string> = {};
    if (vehicleId) {
      const r = await run(() => declarationVehicle(vehicleId), { quiet: true });
      if (r.ok) base = r.data;
    }
    const num = (s?: string) => (s && s.trim() && Number.isFinite(Number(s)) ? Number(s) : null);
    const car = {
      ...BLANK_CAR,
      make: vehicle.make || base.make || "",
      model: vehicle.model || base.model || "",
      version: base.version ?? "",
      plate: vehicle.plate || base.plate || "",
      vin: vehicle.vin || base.vin || "",
      firstRegistration: base.firstRegistration ?? "",
      year: num(base.year),
      mileageKm: km.trim() ? num(km.replace(/\D/g, "")) : num(base.mileageKm),
      color: base.color ?? "",
      fuel: FUELS.includes(base.fuel ?? "") ? base.fuel : "",
      transmission: base.transmission === "automatic" || base.transmission === "manual" ? base.transmission : "",
      engineCc: num(base.engineCc),
      powerHp: num(base.powerHp),
      seats: num(base.seats),
    };
    const price = parseEurosText(payment.sale);
    const groups: DocReview[] = [];
    for (const client of ["buyer", "seller"] as const) {
      const ids = REGISTRATION_DOCS.filter((d) => d.client === client && docSel.has(d.id)).map((d) => d.id);
      if (!ids.length) continue;
      const group: DocReview = { client, ids, fields: [], inputs: {} };
      for (const tid of ids) {
        const own = REGISTRATION_DOCS.find((d) => d.id === tid)?.ownCar;
        const input = {
          template: tid,
          customerId: null,
          vehicleId: own ? null : vehicleId || null,
          customer: docCustomer(client === "buyer" ? buyer : seller),
          vehicle: own ? BLANK_CAR : car,
          deal: {
            priceEur: !own && Number.isFinite(price) && price > 0 ? price : null,
            date: contractDate || todayIso(),
            time: "",
            place: "",
            notes: "",
            warrantyMonths: Number(warranty) || 18,
            warrantyNumber: "",
            warrantyExtras: "",
            iban: "",
          },
        };
        group.inputs[tid] = input;
        const r = await run(() => reviewDeclaration(input));
        if (!r.ok) return;
        for (const f of r.data.fields) if (!group.fields.some((x) => x.key === f.key)) group.fields.push(f);
      }
      groups.push(group);
    }
    setDocEdits({});
    setDocReview(groups);
    requestAnimationFrame(() => document.getElementById("dados-documentos")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function generateDocs() {
    if (!(await flush())) return;
    const jobs = (docReview ?? []).flatMap((g) =>
      g.ids.map((tid) => ({ input: g.inputs[tid]!, reviewed: Object.fromEntries(g.fields.map((f) => [f.key, docValue(g, f)])) })),
    );
    const res = await run(() => generateRegistrationDocs(id, jobs, { markSold: sellNow, km: km.trim() ? Number(km.replace(/\D/g, "")) : null }));
    if (res.ok) {
      setDocs((d) => [...res.data.docs, ...d]);
      setDocReview(null);
      if (res.data.docs[0]) window.open(res.data.docs[0].url, "_blank", "noopener");
      router.refresh();
    }
  }

  const partyCard = (role: Role, p: RegistrationParty) => {
    const set = setParty(role);
    const fields = PARTY_FIELDS.filter((f) =>
      p.kind === "empresa" ? !["docNumber", "docTypeOther", "docIssuer", "docExpiry"].includes(f.key) : f.key !== "certCode" && (f.key !== "docTypeOther" || p.docType === "outro"),
    );
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <section className="a-card" style={{ borderTop: `4px solid ${ROLE[role].tone}` }}>
          <div className="a-card-head">
            <div>
              <h2>
                {role === "buyer" ? "2." : "3."} {ROLE[role].title}
              </h2>
              <p>{ROLE[role].hint}</p>
            </div>
          </div>
          <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
            <div className="a-actions">
              {companies.map((c) => (
                <button key={c.key} type="button" className="a-btn a-btn-sm" onClick={() => set(c.party)}>
                  <Building2 size={15} /> {c.label}
                </button>
              ))}
            </div>
            {customers.length > 0 && (
              <div className="a-field" style={{ maxWidth: 420 }}>
                <label htmlFor={`f-${role}-customer`}>Ou um cliente da lista</label>
                <select id={`f-${role}-customer`} className="a-input" defaultValue="" onChange={(e) => void pickCustomer(role, e.target.value)}>
                  <option value="">Escolher cliente…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="a-tabs" role="radiogroup" aria-label={`Tipo de ${ROLE[role].title.toLowerCase()}`} style={{ border: 0 }}>
              <button type="button" role="radio" aria-checked={p.kind === "particular"} aria-selected={p.kind === "particular"} onClick={() => set((x) => ({ ...x, kind: "particular" }))}>
                <User size={15} /> Particular
              </button>
              <button type="button" role="radio" aria-checked={p.kind === "empresa"} aria-selected={p.kind === "empresa"} onClick={() => set((x) => ({ ...x, kind: "empresa" }))}>
                <Building2 size={15} /> Empresa
              </button>
            </div>
            <div className="a-fields">
              {p.kind === "particular" && (
                <Field label="Documento" name={`${role}-doctype`}>
                  <select id={`f-${role}-doctype`} className="a-input" value={p.docType} onChange={(e) => set((x) => ({ ...x, docType: e.target.value as PartyDocType }))}>
                    {Object.entries(DOC_TYPE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {fields.map((f) => (
                <Field key={f.key} label={`${f.label}${f.required || (f.key === "docNumber" && p.kind === "particular") ? " *" : ""}`} name={`${role}-${f.key}`} wide={f.wide}>
                  <input
                    id={`f-${role}-${f.key}`}
                    type={f.type ?? "text"}
                    inputMode={f.numeric ? "numeric" : undefined}
                    placeholder={f.placeholder}
                    value={(p[f.key] as string) ?? ""}
                    onChange={(e) => set((x) => ({ ...x, [f.key]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p className="muted" aria-live="polite" style={{ fontSize: 13, margin: 0, minHeight: 18 }}>
        {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Tudo guardado." : saveState === "error" ? "Não foi possível guardar. Verifique a ligação." : "As alterações ficam guardadas sozinhas."}
      </p>

      {/* 1. Documentos das pessoas */}
      <AiReader
        mode="parties"
        idSuffix="-registo"
        title="1. Documentos das pessoas e do carro"
        target={{ ownerType: "none", kind: "identificacao" }}
        fields={[]}
        current={{}}
        onApply={() => {}}
        onProposal={(p) => {
          const list = (Array.isArray(p.people) ? (p.people as Record<string, string>[]) : []).map(partyFromRead);
          setPeople(list.length ? list : null);
          // O documento do carro (DUA, Certificado de Matrícula) preenche a viatura.
          const car = p.vehicle as { plate: string; make: string; model: string; vin: string; owner: string } | null | undefined;
          if (car) {
            setVehicle((v) => ({ plate: car.plate || v.plate, make: car.make || v.make, model: car.model || v.model, vin: car.vin || v.vin }));
            setCarOwner(car.owner);
          }
        }}
        onUploaded={(ids) => void save({ addFileIds: ids })}
        intro="Fotografe tudo de uma vez: os documentos das pessoas (Cartão de Cidadão frente e verso, título de residência…) e o documento do carro (DUA ou Certificado de Matrícula). A seguir diz quem é o comprador (e o fiador, se houver)."
      />

      {people && (
        <section className="a-card" style={{ borderTop: "4px solid var(--ok)" }}>
          <div className="a-card-head">
            <div>
              <h2>{people.length === 1 ? "Este documento é de quem?" : "Quem é o comprador?"}</h2>
              <p>
                {people.length === 1
                  ? `${people[0].name || "Pessoa sem nome legível"}: escolha o papel.`
                  : people.length === 2
                    ? "Toque no comprador. O outro fica como vendedor."
                    : "Há mais de duas pessoas nos documentos: escolha o papel de cada uma (comprador, vendedor ou fiador)."}
                {carOwner ? ` No documento do carro, o proprietário é ${carOwner} (normalmente o vendedor).` : ""}
              </p>
            </div>
          </div>
          <div className="a-card-body" style={{ display: "grid", gap: 10 }}>
            {people.length === 1 ? (
              <div className="a-actions">
                <button type="button" className="a-btn a-btn-primary" onClick={() => assign(0, null)}>
                  <UserCheck size={16} /> Comprador
                </button>
                <button type="button" className="a-btn" onClick={() => assign(null, 0)}>
                  <UserCheck size={16} /> Vendedor
                </button>
                <button type="button" className="a-btn" onClick={() => (setGuarantor(people[0]), setPeople(null))}>
                  <UserPlus size={16} /> Fiador
                </button>
              </div>
            ) : people.length === 2 ? (
              <>
                <div className="a-actions">
                  {people.map((pp, i) => (
                    <button key={i} type="button" className="a-btn a-btn-primary" style={{ minHeight: 48, maxWidth: "100%", height: "auto", whiteSpace: "normal", flexWrap: "wrap", justifyContent: "flex-start", textAlign: "left" }} onClick={() => assign(i, 1 - i)}>
                      <UserCheck size={16} /> {pp.name || `Pessoa ${i + 1}`}
                      {pp.nif ? <span style={{ fontWeight: 400, opacity: 0.8 }}> · NIF {pp.nif}</span> : null}
                    </button>
                  ))}
                </div>
                <div className="a-pay-q">
                  <span>Algum é o fiador?</span>
                  <div className="a-actions">
                    {people.map((pp, i) => (
                      <button key={i} type="button" className="a-btn a-btn-sm" onClick={() => (setGuarantor(pp), setBuyer(people[1 - i]), setPeople(null))}>
                        <UserPlus size={15} /> {pp.name || `Pessoa ${i + 1}`} é o fiador
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              people.map((pp, i) => (
                <div key={i} className="a-actions" style={{ justifyContent: "space-between" }}>
                  <strong>{pp.name || `Pessoa ${i + 1}`}</strong>
                  <span className="a-actions">
                    <button type="button" className="a-btn a-btn-sm" onClick={() => setBuyer(pp)}>
                      Comprador
                    </button>
                    <button type="button" className="a-btn a-btn-sm" onClick={() => setSeller(pp)}>
                      Vendedor
                    </button>
                    <button type="button" className="a-btn a-btn-sm" onClick={() => setGuarantor(pp)}>
                      Fiador
                    </button>
                  </span>
                </div>
              ))
            )}
            <div>
              <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setPeople(null)}>
                {people.length > 2 ? "Concluído" : "Ignorar"}
              </button>
            </div>
          </div>
        </section>
      )}

      {partyCard("buyer", buyer)}

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          className="a-btn"
          onClick={() => {
            setBuyer(seller);
            setSeller(buyer);
          }}
        >
          <ArrowLeftRight size={16} /> Trocar comprador e vendedor
        </button>
      </div>

      {partyCard("seller", seller)}

      {/* Fiador / 2.º titular: fica guardado para as Cobranças, não vai para o requerimento */}
      {guarantor ? (
        <section className="a-card">
          <div className="a-card-head">
            <div>
              <h2>Fiador / 2.º titular</h2>
              <p>Não vai para o requerimento do IRN. Entra no contrato das Cobranças como avalista.</p>
            </div>
            <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setGuarantor(null)}>
              <X size={15} /> Tirar
            </button>
          </div>
          <div className="a-card-body a-fields">
            {(
              [
                ["name", "Nome", true],
                ["nif", "NIF", false],
                ["address", "Morada", true],
                ["postalCode", "Código postal", false],
                ["city", "Localidade", false],
              ] as [keyof RegistrationParty, string, boolean][]
            ).map(([k, label, wide]) => (
              <Field key={k} label={label} name={`guarantor-${k}`} wide={wide}>
                <input id={`f-guarantor-${k}`} value={(guarantor[k] as string) ?? ""} onChange={(e) => setGuarantor((g) => (g ? { ...g, [k]: e.target.value } : g))} />
              </Field>
            ))}
          </div>
        </section>
      ) : (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setGuarantor(emptyParty())}>
            <UserPlus size={15} /> Fiador / 2.º titular (opcional, só para as Cobranças)
          </button>
        </div>
      )}

      {/* 4. Viatura (opcional, à mão) */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>4. Viatura e data</h2>
            <p>Escreva à mão ou escolha do stock. O que ficar vazio sai em branco no requerimento.</p>
          </div>
        </div>
        <div className="a-card-body a-fields">
          <Field label="Viatura do stock" name="reg-stock" wide>
            <select
              id="f-reg-stock"
              className="a-input"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                const v = vehicles.find((x) => x.id === e.target.value);
                if (v) setVehicle({ plate: v.plate, make: v.make, model: v.model, vin: v.vin });
              }}
            >
              <option value="">Nenhuma</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          {VEHICLE_FIELDS_RA.map((f) => (
            <Field key={f.key} label={f.label} name={`reg-v-${f.key}`} wide={f.wide}>
              <input
                id={`f-reg-v-${f.key}`}
                autoCapitalize="characters"
                value={vehicle[f.key]}
                onChange={(e) => setVehicle((v) => ({ ...v, [f.key]: f.key === "vin" ? e.target.value.toUpperCase().replace(/\s/g, "") : e.target.value }))}
              />
            </Field>
          ))}
          <Field label="Data da venda" name="reg-date" hint="Vai para a declaração do vendedor (Q7).">
            <input id="f-reg-date" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
          </Field>
        </div>
      </section>

      {/* 4. Gerar */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>5. Requerimento de registo</h2>
            <p>Modelo 1 RA do IRN: declaração para registo de propriedade (contrato verbal de compra e venda). Comprador e vendedor assinam na página 2.</p>
          </div>
          {missing.length ? <span className="a-pill reserved">{missing.length} em branco</span> : <span className="a-pill available">Completo</span>}
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {missing.length > 0 && (
            <Alert kind="info" title="Pode gerar já: isto sai em branco para completar à mão">
              <p>{missing.join(", ")}.</p>
            </Alert>
          )}
          <div className="a-actions">
            <button type="button" className="a-btn a-btn-primary" onClick={generate} disabled={pending}>
              {pending ? <Spinner /> : <FileText size={16} />} {pdfUrl ? "Gerar de novo" : missing.length ? "Gerar com o que há (PDF)" : "Gerar requerimento (PDF)"}
            </button>
            {pdfUrl && (
              <a className="a-btn" href={pdfUrl} target="_blank" rel="noopener">
                <FileDown size={16} /> Abrir requerimento
              </a>
            )}
          </div>
          <div className="a-fields">
            <Field label="Estado" name="reg-status">
              <select id="f-reg-status" className="a-input" value={status} onChange={(e) => setStatus(e.target.value as RegistrationStatus)}>
                {Object.entries(REGISTRATION_STATUS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notas" name="reg-notes" wide>
              <textarea id="f-reg-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      {/* 6. Pagamento: checklist do que ficou por pagar */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>6. Pagamento</h2>
            <p>Ficou alguma coisa por pagar? Responda e fica tudo anotado neste processo.</p>
          </div>
          {payment.owed === "nao" ? (
            <span className="a-pill available">Pago</span>
          ) : payment.owed === "sim" ? (
            <span className="a-pill reserved">{payment.chargeId ? "Nas Cobranças" : `Falta ${eur(owed)}`}</span>
          ) : null}
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 16 }}>
          <div className="a-fields">
            <Field label="Valor da venda (€)" name="pay-sale">
              <input id="f-pay-sale" inputMode="decimal" value={payment.sale} onChange={(e) => pay("sale", e.target.value)} placeholder="ex.: 30000" />
            </Field>
            <Field label="Entrada paga (€)" name="pay-down" hint="O que o comprador já pagou.">
              <input id="f-pay-down" inputMode="decimal" value={payment.down} onChange={(e) => pay("down", e.target.value)} placeholder="0" />
            </Field>
            <Field label="Pago pelo banco / financeira (€)" name="pay-bank" hint="Crédito automóvel, se houver.">
              <input id="f-pay-bank" inputMode="decimal" value={payment.bank} onChange={(e) => pay("bank", e.target.value)} placeholder="0" />
            </Field>
          </div>
          {choice("owed", "Ficou algum valor por pagar?", [
            ["sim", "Sim"],
            ["nao", "Não, está tudo pago"],
          ])}
          {payment.owed === "sim" && (
            <>
              <div className="a-fields">
                <Field label="Ficou por pagar (€)" name="pay-pending" hint={payment.pending.trim() ? undefined : "Venda − entrada − banco. Pode mudar."}>
                  <input id="f-pay-pending" inputMode="decimal" value={payment.pending} onChange={(e) => pay("pending", e.target.value)} placeholder={owed ? String(owed).replace(".", ",") : "0"} />
                </Field>
              </div>
              {choice("how", "Como vai ser pago?", [
                ["vista", "À vista"],
                ["prestacoes", "Em prestações"],
              ])}
              {payment.how === "vista" && (
                <div className="a-fields">
                  <Field label="Paga até" name="pay-due" hint="Data combinada.">
                    <input id="f-pay-due" type="date" value={payment.dueDate} onChange={(e) => pay("dueDate", e.target.value)} />
                  </Field>
                </div>
              )}
              {payment.how === "prestacoes" &&
                (payment.chargeId ? (
                  <Alert kind="ok" title="Já está nas Cobranças">
                    <p>
                      <Link href={`/painel/cobrancas/${payment.chargeId}`} target="_blank" rel="noopener">
                        Abrir a venda a prestações
                      </Link>
                    </p>
                  </Alert>
                ) : (
                  <>
                    {choice("toCharges", "Passar para as Cobranças?", [
                      ["sim", "Sim"],
                      ["nao", "Não"],
                    ])}
                    {payment.toCharges === "sim" &&
                      (canCharge ? (
                        <div className="a-pay-next">
                          <p className="muted">
                            Abre a venda a prestações já preenchida com o comprador{guarantor ? ", o fiador" : ""}, o carro e os valores. Abre numa janela nova (esta fica aberta para continuar): lá escolhe as prestações e gera o contrato para assinar.
                          </p>
                          <button type="button" className="a-btn a-btn-primary" onClick={openCharges} disabled={pending}>
                            <ArrowRight size={16} /> Abrir nas Cobranças
                          </button>
                        </div>
                      ) : (
                        <p className="muted" style={{ margin: 0 }}>
                          Só quem gere as Cobranças pode criar a venda a prestações. Fica anotado aqui.
                        </p>
                      ))}
                  </>
                ))}
              <div className="a-fields">
                <Field label="Como ficou combinado" name="pay-notes" wide hint="Anotações: quem paga, quando e como.">
                  <textarea id="f-pay-notes" rows={3} value={payment.notes} onChange={(e) => pay("notes", e.target.value)} />
                </Field>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 7. Declarações e documentos: o "3. Documentos" da ficha do carro */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>7. Declarações e documentos</h2>
            <p>Gerados já preenchidos com a viatura, o comprador, o vendedor e a empresa. Os modelos mudam-se em Configurações → Modelos.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {docOptions.map((d) => {
            const meta = REGISTRATION_DOCS.find((x) => x.id === d.id);
            return (
              <label key={d.id} className="a-check">
                <input
                  type="checkbox"
                  checked={docSel.has(d.id)}
                  onChange={(e) => {
                    const next = new Set(docSel);
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                    setDocSel(next);
                    setDocReview(null);
                  }}
                />
                <span>
                  <strong style={{ fontWeight: 600 }}>{d.title}</strong>
                  <span className="muted" style={{ display: "block", fontSize: 13 }}>
                    {d.description} {meta?.client === "seller" ? "Cliente: o vendedor." : meta?.ownCar ? "Cliente: o comprador, com o carro dele." : ""}
                  </span>
                </span>
              </label>
            );
          })}
          <div className="a-fields">
            <Field label="Preço de venda (€)" name="docs-price" hint="O mesmo do 6. Pagamento.">
              <input id="f-docs-price" inputMode="decimal" value={payment.sale} onChange={(e) => pay("sale", e.target.value)} placeholder="ex.: 15000" />
            </Field>
            <Field label="Quilómetros na entrega" name="docs-km" hint={vehicleId ? "Vazio = os da ficha do carro." : undefined}>
              <input id="f-docs-km" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
            </Field>
            {docSel.has("termo_garantia") && (
              <Field label="Garantia (meses)" name="docs-warranty">
                <input id="f-docs-warranty" inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/\D/g, "").slice(0, 3))} />
              </Field>
            )}
          </div>
          {canSell &&
            (vehicleSold ? (
              <p className="muted" style={{ margin: 0, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                Esta viatura já está marcada como vendida.
              </p>
            ) : (
              <label className="a-check" style={{ paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <input type="checkbox" checked={markSold} onChange={(e) => setMarkSold(e.target.checked)} />
                <span>
                  <strong style={{ fontWeight: 600 }}>Marcar a viatura como vendida</strong>
                  <span className="muted" style={{ display: "block", fontSize: 13 }}>
                    Associa o comprador (cria a ficha se não existir), regista preço e data e, no site, passa a “Vendido”.
                  </span>
                </span>
              </label>
            ))}
        </div>
        <div className="a-form-foot" style={{ margin: 0, flexWrap: "wrap", gap: 12 }}>
          {docSel.size > 0 ? (
            <button type="button" className="a-btn a-btn-primary" onClick={reviewDocs} disabled={pending}>
              {pending && !docReview ? <Spinner /> : <ClipboardCheck size={16} />} Rever dados dos documentos
            </button>
          ) : sellNow ? (
            <button type="button" className="a-btn a-btn-primary" onClick={generateDocs} disabled={pending}>
              {pending ? <Spinner /> : <CheckCircle2 size={16} />} Marcar como vendida
            </button>
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>
              Escolha pelo menos um documento.
            </span>
          )}
        </div>
        {docs.length > 0 && (
          <ul className="a-assume-list">
            {docs.map((d, i) => (
              <li key={`${d.url}-${i}`}>
                <FileText size={16} aria-hidden />
                <span>
                  <strong>{d.title}</strong>
                  <small className="muted">
                    PDF · {whenPt(d.at)}
                  </small>
                </span>
                <a className="a-btn a-btn-sm" href={d.url} target="_blank" rel="noopener">
                  <FileDown size={14} /> Abrir
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {docReview && (
        <section className="a-card" id="dados-documentos" style={{ scrollMarginTop: 16 }}>
          <div className="a-card-head">
            <div>
              <h2>Dados dos documentos</h2>
              <p>Tudo o que vai aparecer nos documentos. Confira, corrija e complete o que falta — só depois se gera.</p>
            </div>
            {docMissing.length > 0 ? <span className="a-pill danger">{docMissing.length} por preencher</span> : <span className="a-pill available">Completo</span>}
          </div>
          <div className="a-card-body" style={{ display: "grid", gap: 20 }}>
            {docReview.map((g) => (
              <div key={g.client} style={{ display: "grid", gap: 12 }}>
                {docReview.length > 1 && (
                  <h3 className="a-section-title" style={{ margin: 0 }}>
                    {g.client === "buyer" ? "Cliente: o comprador" : "Cliente: o vendedor"} — {g.ids.map(docTitle).join(", ")}
                  </h3>
                )}
                <ContractFields
                  idPrefix={`doc-${g.client}`}
                  fields={g.fields}
                  edited={docEdits[g.client] ?? {}}
                  onEdit={(patch) => setDocEdits((x) => ({ ...x, [g.client]: { ...(x[g.client] ?? {}), ...patch } }))}
                  errors={errors}
                />
              </div>
            ))}
          </div>
          <div className="a-form-foot" style={{ margin: 0, flexWrap: "wrap", gap: 12 }}>
            <button type="button" className="a-btn a-btn-primary" onClick={generateDocs} disabled={pending || docMissing.length > 0}>
              {pending ? <Spinner /> : <CheckCircle2 size={16} />} {sellNow ? "Marcar como vendida e gerar documentos" : "Gerar documentos"}
            </button>
            {docMissing.length > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                Falta preencher: {[...new Set(docMissing.map((f) => f.label))].join(", ")}.
              </span>
            )}
          </div>
        </section>
      )}

      <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>Apagar processo</strong>
          <p className="muted" style={{ fontSize: 13 }}>
            As fotografias e o requerimento gerado continuam guardados.
          </p>
        </div>
        <button type="button" className="a-btn a-btn-danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} /> Apagar
        </button>
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Apagar processo"
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
                  if ((await run(() => deleteRegistration(id))).ok) {
                    if (embedded) router.refresh();
                    else router.push("/painel/registo");
                  }
                }}
              >
                Apagar
              </button>
            </>
          }
        >
          <p>Apagar este processo de compra e venda?</p>
        </Dialog>
      </section>
    </div>
  );
}
