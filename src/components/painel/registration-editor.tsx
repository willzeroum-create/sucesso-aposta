"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Building2, FileDown, FileText, Trash2, User, UserCheck } from "lucide-react";
import { deleteRegistration, generateRegistration, saveRegistration, type RegistrationPatch } from "@/app/painel/_actions/registrations";
import { dealCustomer } from "@/app/painel/_actions/sales";
import {
  defaultIssuer,
  DOC_TYPE_LABEL,
  docTypeFrom,
  emptyParty,
  PARTY_FIELDS,
  REGISTRATION_STATUS,
  registrationMissing,
  VEHICLE_FIELDS_RA,
  type PartyDocType,
  type RegistrationParty,
  type RegistrationStatus,
  type RegistrationVehicle,
} from "@/lib/registo";
import { AiReader } from "./ai-reader";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

type Option = { id: string; label: string };
type StockVehicle = Option & { plate: string; make: string; model: string; vin: string };
type CompanyPreset = { key: string; label: string; party: RegistrationParty };
type Role = "buyer" | "seller";

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
  vehicles,
  customers,
  companies,
  pdfUrl: initialPdf,
}: {
  id: string;
  initial: { buyer: RegistrationParty; seller: RegistrationParty; vehicle: RegistrationVehicle; contractDate: string; vehicleId: string | null; status: RegistrationStatus; notes: string };
  vehicles: StockVehicle[];
  customers: Option[];
  companies: CompanyPreset[];
  pdfUrl: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [buyer, setBuyer] = useState(initial.buyer);
  const [seller, setSeller] = useState(initial.seller);
  const [vehicle, setVehicle] = useState(initial.vehicle);
  const [contractDate, setContractDate] = useState(initial.contractDate);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId ?? "");
  const [status, setStatus] = useState(initial.status);
  const [notes, setNotes] = useState(initial.notes);
  const [pdfUrl, setPdfUrl] = useState(initialPdf);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Pessoas lidas nos documentos, à espera de se dizer quem é o comprador. */
  const [people, setPeople] = useState<RegistrationParty[] | null>(null);
  /** Proprietário escrito no documento do carro (normalmente o vendedor). */
  const [carOwner, setCarOwner] = useState("");

  // Grava sozinho pouco depois de cada alteração.
  const snapshot = useMemo(() => JSON.stringify({ buyer, seller, vehicle, contractDate, vehicleId, status, notes }), [buyer, seller, vehicle, contractDate, vehicleId, status, notes]);
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
    });
    if (ok) lastSaved.current = snapshot;
    return ok;
  }, [snapshot, save, buyer, seller, vehicle, contractDate, vehicleId, status, notes]);
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
        lastSaved.current = JSON.stringify({ buyer, seller, vehicle, contractDate, vehicleId, status: "generated", notes });
      }
      window.open(res.data.url, "_blank", "noopener");
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
        intro="Fotografe tudo de uma vez: os documentos das pessoas (Cartão de Cidadão frente e verso, título de residência…) e o documento do carro (DUA ou Certificado de Matrícula). A seguir diz quem é o comprador."
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
                    : "Há mais de duas pessoas nos documentos: escolha o papel de cada uma."}
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
              </div>
            ) : people.length === 2 ? (
              <div className="a-actions">
                {people.map((pp, i) => (
                  <button key={i} type="button" className="a-btn a-btn-primary" style={{ minHeight: 48, maxWidth: "100%", height: "auto", whiteSpace: "normal", flexWrap: "wrap", justifyContent: "flex-start", textAlign: "left" }} onClick={() => assign(i, 1 - i)}>
                    <UserCheck size={16} /> {pp.name || `Pessoa ${i + 1}`}
                    {pp.nif ? <span style={{ fontWeight: 400, opacity: 0.8 }}> · NIF {pp.nif}</span> : null}
                  </button>
                ))}
              </div>
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
                  if ((await run(() => deleteRegistration(id))).ok) router.push("/painel/registo");
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
