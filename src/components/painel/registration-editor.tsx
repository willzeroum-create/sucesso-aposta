"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Building2, FileDown, FileText, Trash2, User } from "lucide-react";
import { deleteRegistration, generateRegistration, saveRegistration, type RegistrationPatch } from "@/app/painel/_actions/registrations";
import { dealCustomer } from "@/app/painel/_actions/sales";
import {
  defaultIssuer,
  DOC_TYPE_LABEL,
  docTypeFrom,
  PARTY_FIELDS,
  REGISTRATION_STATUS,
  registrationMissing,
  VEHICLE_FIELDS_RA,
  type PartyDocType,
  type RegistrationParty,
  type RegistrationStatus,
  type RegistrationVehicle,
} from "@/lib/registo";
import { AiReader, type FieldMeta } from "./ai-reader";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

type Option = { id: string; label: string };
type StockVehicle = Option & { plate: string; make: string; model: string; vin: string };
type CompanyPreset = { key: string; label: string; party: RegistrationParty };
type Role = "buyer" | "seller";

const PARTY_META: FieldMeta[] = [
  { key: "kind", label: "Tipo" },
  { key: "docType", label: "Tipo de documento" },
  ...PARTY_FIELDS.map((f) => ({ key: f.key, label: f.label, important: f.required })),
];
const VEHICLE_META: FieldMeta[] = VEHICLE_FIELDS_RA.map((f) => ({ key: f.key, label: f.label, important: f.required }));
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

  /** O que a IA leu: o tipo de documento vem em texto e a entidade emissora completa-se se faltar. */
  function applyRead(role: Role, found: Record<string, string>) {
    setParty(role)((p) => {
      const next = { ...p, ...found } as RegistrationParty;
      if (found.docTypeOther && !found.docType) next.docType = "outro";
      if (!next.docIssuer && next.kind === "particular") next.docIssuer = defaultIssuer(next);
      return next;
    });
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
        <AiReader
          mode="requester"
          idSuffix={`-${role}`}
          title={`Documento do ${ROLE[role].title.toLowerCase()}`}
          target={{ ownerType: "none", kind: "identificacao" }}
          fields={PARTY_META}
          // O tipo (empresa/particular) e o tipo de documento vêm sempre do documento lido.
          current={{ ...(p as unknown as Record<string, string>), kind: "", docType: "" }}
          onApply={(found) => applyRead(role, found)}
          onUploaded={(ids) => void save({ addFileIds: ids })}
          intro={`Fotografe SÓ o documento do ${ROLE[role].title.toLowerCase()}: Cartão de Cidadão (frente e verso), título de residência ou certidão permanente da empresa.`}
        />
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p className="muted" aria-live="polite" style={{ fontSize: 13, margin: 0, minHeight: 18 }}>
        {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Tudo guardado." : saveState === "error" ? "Não foi possível guardar. Verifique a ligação." : "As alterações ficam guardadas sozinhas."}
      </p>

      {/* 1. Viatura */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>1. Viatura</h2>
            <p>Escolha do stock ou fotografe o documento único (DUA).</p>
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
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} name={`reg-v-${f.key}`} wide={f.wide}>
              <input
                id={`f-reg-v-${f.key}`}
                autoCapitalize="characters"
                value={vehicle[f.key]}
                onChange={(e) => setVehicle((v) => ({ ...v, [f.key]: f.key === "vin" ? e.target.value.toUpperCase().replace(/\s/g, "") : e.target.value }))}
              />
            </Field>
          ))}
          <Field label="Data da venda *" name="reg-date" hint="Vai para a declaração do vendedor (Q7).">
            <input id="f-reg-date" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
          </Field>
        </div>
      </section>
      <AiReader
        mode="vehicle"
        idSuffix="-registo"
        title="Documento da viatura"
        target={vehicleId ? { ownerType: "vehicle", ownerId: vehicleId, kind: "dua" } : { ownerType: "none", kind: "dua" }}
        fields={VEHICLE_META}
        current={vehicle as unknown as Record<string, string>}
        onApply={(found) => setVehicle((v) => ({ ...v, ...found }))}
        onUploaded={(ids) => void save({ addFileIds: ids })}
        intro="Fotografe o DUA / certificado de matrícula: a matrícula, a marca e o nº de quadro preenchem-se sozinhos."
      />

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

      {/* 4. Gerar */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>4. Requerimento de registo</h2>
            <p>Modelo 1 RA do IRN: declaração para registo de propriedade (contrato verbal de compra e venda). Comprador e vendedor assinam na página 2.</p>
          </div>
          {missing.length ? <span className="a-pill danger">{missing.length} em falta</span> : <span className="a-pill available">Pronto</span>}
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {missing.length > 0 && (
            <Alert kind="warn" title="Falta preencher">
              <p>{missing.join(", ")}.</p>
            </Alert>
          )}
          <div className="a-actions">
            <button type="button" className="a-btn a-btn-primary" onClick={generate} disabled={pending || missing.length > 0}>
              {pending ? <Spinner /> : <FileText size={16} />} {pdfUrl ? "Gerar de novo" : "Gerar requerimento (PDF)"}
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
