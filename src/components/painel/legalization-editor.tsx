"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Copy, ExternalLink, FileDown, FileText, Trash2, User } from "lucide-react";
import { deleteLegalization, generateModelo9, saveLegalization, type LegalizationPatch } from "@/app/painel/_actions/legalizations";
import { dealCustomer } from "@/app/painel/_actions/sales";
import {
  homologationFields,
  IMT_HOMOLOGATION_URL,
  LEGALIZATION_STATUS,
  modelo9Missing,
  REQUESTER_FIELDS,
  VEHICLE_FIELDS,
  type LegalizationStatus,
  type Modelo9Requester,
  type Modelo9Vehicle,
} from "@/lib/modelo9";
import { AiReader, type FieldMeta } from "./ai-reader";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

type Option = { id: string; label: string };
type FileInfo = { id: string; name: string; mime: string };
type CompanyPreset = { key: string; label: string; requester: Modelo9Requester };

const VEHICLE_META: FieldMeta[] = VEHICLE_FIELDS.map((f) => ({ key: f.key, label: f.label, important: f.required }));
const REQUESTER_META: FieldMeta[] = [{ key: "kind", label: "Tipo" }, ...REQUESTER_FIELDS.map((f) => ({ key: f.key, label: f.label, important: f.required }))];

export function LegalizationEditor({
  id,
  initial,
  files,
  vehicles,
  customers,
  companies,
  modelo9Url,
}: {
  id: string;
  initial: { requester: Modelo9Requester; vehicle: Modelo9Vehicle; vehicleId: string | null; status: LegalizationStatus; notes: string };
  files: FileInfo[];
  vehicles: Option[];
  customers: Option[];
  companies: CompanyPreset[];
  modelo9Url: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [requester, setRequester] = useState(initial.requester);
  const [vehicle, setVehicle] = useState(initial.vehicle);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId ?? "");
  const [status, setStatus] = useState(initial.status);
  const [notes, setNotes] = useState(initial.notes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pdfUrl, setPdfUrl] = useState(modelo9Url);
  const [copied, setCopied] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(files.map((f) => f.id)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customerPick, setCustomerPick] = useState("");

  // Grava sozinho, pouco depois de cada alteração (no telemóvel não há "esqueci-me de guardar").
  const snapshot = useMemo(() => JSON.stringify({ requester, vehicle, vehicleId, status, notes }), [requester, vehicle, vehicleId, status, notes]);
  const lastSaved = useRef(snapshot);
  const save = useCallback(
    async (patch: LegalizationPatch) => {
      setSaveState("saving");
      const res = await saveLegalization(id, patch).catch(() => null);
      setSaveState(res?.ok ? "saved" : "error");
      return Boolean(res?.ok);
    },
    [id],
  );
  const flush = useCallback(async () => {
    if (snapshot === lastSaved.current) return true;
    const ok = await save({ requester, vehicle: { ...vehicle } as Record<string, string>, vehicleId: vehicleId || null, status, notes });
    if (ok) lastSaved.current = snapshot;
    return ok;
  }, [snapshot, save, requester, vehicle, vehicleId, status, notes]);
  useEffect(() => {
    if (snapshot === lastSaved.current) return;
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [snapshot, flush]);

  const missing = modelo9Missing(requester, vehicle);
  const homolog = homologationFields(requester, vehicle, companies[0]?.requester.email ?? "");

  const setReq = (k: keyof Modelo9Requester, v: string) => setRequester((r) => ({ ...r, [k]: v }));
  const setVeh = (k: keyof Modelo9Vehicle, v: string) => setVehicle((x) => ({ ...x, [k]: v }));

  async function addFiles(ids: string[]) {
    setPicked((p) => new Set([...p, ...ids]));
    await save({ addFileIds: ids });
    router.refresh();
  }

  async function pickCustomer(customerId: string) {
    setCustomerPick(customerId);
    if (!customerId) return;
    const res = await run(() => dealCustomer(customerId), { quiet: true });
    if (!res.ok) return;
    const c = res.data;
    setRequester({
      kind: "particular",
      name: c.fullName,
      nif: c.nif,
      docNumber: c.idDocumentNumber,
      certCode: "",
      address: c.address,
      postalCode: c.postalCode,
      city: c.city,
      email: c.email,
      phone: c.phone,
    });
  }

  async function generate() {
    if (!(await flush())) return;
    const res = await run(() => generateModelo9(id));
    if (res.ok) {
      setPdfUrl(res.data.url);
      if (status === "draft") {
        setStatus("generated");
        lastSaved.current = JSON.stringify({ requester, vehicle, vehicleId, status: "generated", notes });
      }
      window.open(res.data.url, "_blank", "noopener");
      router.refresh();
    }
  }

  function copy(label: string, value: string) {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    });
  }

  const reqFields = REQUESTER_FIELDS.filter((f) => (requester.kind === "empresa" ? f.key !== "docNumber" : f.key !== "certCode"));
  const pdfIds = files.filter((f) => picked.has(f.id)).map((f) => f.id);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p className="muted" aria-live="polite" style={{ fontSize: 13, margin: 0, minHeight: 18 }}>
        {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Tudo guardado." : saveState === "error" ? "Não foi possível guardar. Verifique a ligação." : "As alterações ficam guardadas sozinhas."}
      </p>

      {/* 1. Viatura */}
      <AiReader
        mode="import"
        target={{ ownerType: "none", kind: "livrete_estrangeiro" }}
        fields={VEHICLE_META}
        current={vehicle as unknown as Record<string, string>}
        onApply={(found) => setVehicle((v) => ({ ...v, ...found }))}
        onUploaded={(ids) => void addFiles(ids)}
        intro="1. Fotografe o livrete estrangeiro (Parte I e II, frente e verso) e o CoC, se houver. A IA preenche os dados da viatura."
      />
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Dados da viatura</h2>
            <p>Os campos com * são obrigatórios no Modelo 9. As letras indicam o campo do livrete.</p>
          </div>
        </div>
        <div className="a-card-body a-fields">
          {VEHICLE_FIELDS.map((f) =>
            f.key === "category" || f.key === "purpose" ? (
              <Field key={f.key} label={f.label} name={`v-${f.key}`}>
                <select id={`f-v-${f.key}`} className="a-input" value={vehicle[f.key]} onChange={(e) => setVeh(f.key, e.target.value)}>
                  <option value="">—</option>
                  {(f.key === "category" ? ["Ligeiro", "Pesado"] : ["Passageiros", "Mercadorias"]).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`} name={`v-${f.key}`} hint={f.hint ? `Campo ${f.hint}` : undefined} wide={f.wide}>
                <input
                  id={`f-v-${f.key}`}
                  type={f.type ?? "text"}
                  inputMode={f.numeric ? "numeric" : undefined}
                  autoCapitalize={f.key === "vin" || f.key === "foreignPlate" ? "characters" : undefined}
                  value={vehicle[f.key] ?? ""}
                  onChange={(e) => setVeh(f.key, f.key === "vin" ? e.target.value.toUpperCase().replace(/\s/g, "") : e.target.value)}
                />
              </Field>
            ),
          )}
        </div>
      </section>

      {/* 2. Requerente */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>2. Requerente</h2>
            <p>Em nome de quem o carro fica registado (parte de cima do Modelo 9).</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          <div className="a-actions">
            {companies.map((c) => (
              <button key={c.key} type="button" className="a-btn a-btn-sm" onClick={() => setRequester(c.requester)} aria-pressed={requester.nif === c.requester.nif && requester.kind === "empresa"}>
                <Building2 size={15} /> {c.label}
              </button>
            ))}
          </div>
          {customers.length > 0 && (
            <div className="a-field" style={{ maxWidth: 420 }}>
              <label htmlFor="f-req-customer">Ou um cliente da lista</label>
              <select id="f-req-customer" className="a-input" value={customerPick} onChange={(e) => void pickCustomer(e.target.value)}>
                <option value="">Escolher cliente…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="a-tabs" role="radiogroup" aria-label="Tipo de requerente" style={{ border: 0 }}>
            <button type="button" role="radio" aria-checked={requester.kind === "empresa"} aria-selected={requester.kind === "empresa"} onClick={() => setReq("kind", "empresa")}>
              <Building2 size={15} /> Empresa
            </button>
            <button type="button" role="radio" aria-checked={requester.kind === "particular"} aria-selected={requester.kind === "particular"} onClick={() => setReq("kind", "particular")}>
              <User size={15} /> Particular
            </button>
          </div>
          <div className="a-fields">
            {reqFields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required || (f.key === "docNumber" && requester.kind === "particular") ? " *" : ""}`} name={`r-${f.key}`} wide={f.wide}>
                <input
                  id={`f-r-${f.key}`}
                  type={f.type ?? "text"}
                  inputMode={f.numeric ? "numeric" : undefined}
                  value={(requester[f.key] as string) ?? ""}
                  onChange={(e) => setReq(f.key, e.target.value)}
                  placeholder={f.key === "postalCode" ? "0000-000" : f.key === "certCode" ? "0000-0000-0000" : undefined}
                />
              </Field>
            ))}
          </div>
        </div>
      </section>
      <AiReader
        mode="requester"
        target={{ ownerType: "none", kind: "identificacao" }}
        fields={REQUESTER_META}
        current={requester as unknown as Record<string, string>}
        onApply={(found) => setRequester((r) => ({ ...r, ...found }) as Modelo9Requester)}
        onUploaded={(ids) => void addFiles(ids)}
        intro="Outro requerente? Fotografe a certidão permanente da empresa ou o documento de identificação da pessoa."
      />

      {/* 3. Modelo 9 */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>3. Modelo 9</h2>
            <p>Sai com atribuição de matrícula, homologação e inspeção assinaladas. A data e a assinatura ficam para o requerente.</p>
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
              {pending ? <Spinner /> : <FileText size={16} />} {pdfUrl ? "Gerar de novo" : "Gerar Modelo 9 (PDF)"}
            </button>
            {pdfUrl && (
              <a className="a-btn" href={pdfUrl} target="_blank" rel="noopener">
                <FileDown size={16} /> Abrir Modelo 9
              </a>
            )}
          </div>
          <div className="a-fields">
            <Field label="Estado" name="status">
              <select id="f-status" className="a-input" value={status} onChange={(e) => setStatus(e.target.value as LegalizationStatus)}>
                {Object.entries(LEGALIZATION_STATUS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Viatura do stock" name="stock" hint="O Modelo 9 também fica nos documentos dela.">
              <select id="f-stock" className="a-input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Nenhuma</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notas" name="notes" wide>
              <textarea id="f-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      {/* 4. Homologação */}
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>4. Homologação (IMT)</h2>
            <p>Abra o site do IMT e copie cada campo pela ordem do formulário.</p>
          </div>
          <a className="a-btn a-btn-sm" href={IMT_HOMOLOGATION_URL} target="_blank" rel="noopener">
            <ExternalLink size={15} /> Site do IMT
          </a>
        </div>
        <div className="a-docs">
          {homolog.map((h) => (
            <div key={h.label} className="a-doc" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <span style={{ minWidth: 0 }}>
                <small>{h.label}</small>
                <strong style={{ overflowWrap: "anywhere" }}>{h.value || <span className="muted">—</span>}</strong>
              </span>
              <button type="button" className="a-btn a-btn-sm" onClick={() => copy(h.label, h.value)} disabled={!h.value} aria-label={`Copiar ${h.label}`}>
                {copied === h.label ? <Check size={15} /> : <Copy size={15} />} {copied === h.label ? "Copiado" : "Copiar"}
              </button>
            </div>
          ))}
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line)" }}>
          <strong style={{ fontWeight: 600 }}>Documentos para anexar</strong>
          {files.length ? (
            <>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                O IMT só aceita PDF. Escolha as fotografias (ex.: só o livrete, ou livrete + CoC) e descarregue-as juntas num PDF.
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {files.map((f, i) => (
                  <label key={f.id} className="a-check">
                    <input
                      type="checkbox"
                      checked={picked.has(f.id)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(f.id);
                          else n.delete(f.id);
                          return n;
                        })
                      }
                    />
                    <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                      {i + 1}. {f.name}{" "}
                      <a href={`/api/admin/files/${f.id}`} target="_blank" rel="noopener" className="muted" style={{ fontSize: 13 }}>
                        ver
                      </a>
                    </span>
                  </label>
                ))}
              </div>
              <div>
                <a
                  className={`a-btn a-btn-sm${pdfIds.length ? "" : " is-disabled"}`}
                  href={pdfIds.length ? `/api/admin/legalizations/${id}/pdf?ids=${pdfIds.join(",")}` : undefined}
                  aria-disabled={!pdfIds.length}
                  target="_blank"
                  rel="noopener"
                >
                  <FileDown size={15} /> Descarregar {pdfIds.length} em PDF
                </a>
              </div>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Ainda não há fotografias. As que forem lidas no passo 1 e 2 aparecem aqui.
            </p>
          )}
        </div>
      </section>

      <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>Apagar processo</strong>
          <p className="muted" style={{ fontSize: 13 }}>
            As fotografias e o Modelo 9 gerado continuam guardados.
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
                  const res = await run(() => deleteLegalization(id));
                  if (res.ok) router.push("/painel/legalizacao");
                }}
              >
                Apagar
              </button>
            </>
          }
        >
          <p>Apagar este processo de Modelo 9?</p>
        </Dialog>
      </section>
    </div>
  );
}
