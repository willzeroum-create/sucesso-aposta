"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, Copy, ExternalLink, FileDown, FileText, Trash2, User } from "lucide-react";
import { addLegalizationDocuments, deleteLegalization, generateModelo9, saveLegalization, type LegalizationPatch } from "@/app/painel/_actions/legalizations";
import { dealCustomer } from "@/app/painel/_actions/sales";
import {
  clientToRequester,
  davDeadline,
  davMissing,
  davSections,
  deadlineText,
  registoDeadline,
  STAGE_LABEL,
  STAGES,
  stageIndex,
  type LegalClientData,
  type Stage,
} from "@/lib/legalizacao";
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
import { CustomsStep, LegalizationDocuments, RegistrationStep, pdfLink, type LegalDoc } from "./legalization-steps";
import { Alert, Dialog, Field, Spinner, useAction } from "./ui";

type Option = { id: string; label: string };
type ClientOption = { id: string; label: string; data: LegalClientData };
type CompanyPreset = { key: string; label: string; requester: Modelo9Requester };
export type LegalTab = "modelo9" | "alfandega" | "registo" | "documentos";

const VEHICLE_META: FieldMeta[] = VEHICLE_FIELDS.map((f) => ({ key: f.key, label: f.label, important: f.required }));
const REQUESTER_META: FieldMeta[] = [{ key: "kind", label: "Tipo" }, ...REQUESTER_FIELDS.map((f) => ({ key: f.key, label: f.label, important: f.required }))];

export function LegalizationEditor({
  id,
  initial,
  docs,
  vehicles,
  customers,
  clients,
  companies,
  modelo9Url,
  initialTab,
}: {
  id: string;
  initial: {
    requester: Modelo9Requester;
    vehicle: Modelo9Vehicle;
    vehicleId: string | null;
    clientId: string | null;
    stage: Stage;
    entryDate: string;
    customs: Record<string, string>;
    registration: Record<string, string>;
    status: LegalizationStatus;
    notes: string;
  };
  docs: LegalDoc[];
  vehicles: Option[];
  customers: Option[];
  clients: ClientOption[];
  companies: CompanyPreset[];
  modelo9Url: string | null;
  initialTab: LegalTab;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [tab, setTab] = useState<LegalTab>(initialTab);
  const [requester, setRequester] = useState(initial.requester);
  const [vehicle, setVehicle] = useState(initial.vehicle);
  const [vehicleId, setVehicleId] = useState(initial.vehicleId ?? "");
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [entryDate, setEntryDate] = useState(initial.entryDate);
  const [customs, setCustoms] = useState(initial.customs);
  const [registration, setRegistration] = useState(initial.registration);
  const [status, setStatus] = useState(initial.status);
  const [notes, setNotes] = useState(initial.notes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [pdfUrl, setPdfUrl] = useState(modelo9Url);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customerPick, setCustomerPick] = useState("");

  // Grava sozinho, pouco depois de cada alteração (no telemóvel não há "esqueci-me de guardar").
  const state = { requester, vehicle, vehicleId, clientId, stage, entryDate, customs, registration, status, notes };
  const snapshot = JSON.stringify(state);
  const lastSaved = useRef(snapshot);
  const latest = useRef(state);
  latest.current = state;
  const flush = useCallback(async () => {
    const s = latest.current;
    const snap = JSON.stringify(s);
    if (snap === lastSaved.current) return true;
    setSaveState("saving");
    const patch: LegalizationPatch = {
      requester: s.requester,
      vehicle: { ...s.vehicle } as Record<string, string>,
      vehicleId: s.vehicleId || null,
      clientId: s.clientId || null,
      stage: s.stage,
      entryDate: s.entryDate,
      customs: s.customs,
      registration: s.registration,
      status: s.status,
      notes: s.notes,
    };
    const res = await saveLegalization(id, patch).catch(() => null);
    if (res?.ok) {
      lastSaved.current = snap;
      setSaveState("saved");
      // Sem cliente escolhido, o servidor encontra-o ou cria-o pelo NIF do requerente.
      if (res.data.clientId && res.data.clientId !== s.clientId) {
        setClientId(res.data.clientId);
        lastSaved.current = JSON.stringify({ ...s, clientId: res.data.clientId });
        router.refresh();
      }
      return true;
    }
    setSaveState("error");
    return false;
  }, [id, router]);
  useEffect(() => {
    if (snapshot === lastSaved.current) return;
    const t = setTimeout(() => void flush(), 900);
    return () => clearTimeout(t);
  }, [snapshot, flush]);

  const missing = modelo9Missing(requester, vehicle);
  const homolog = homologationFields(requester, vehicle, companies[0]?.requester.email ?? "");
  const sections = useMemo(() => davSections(requester, vehicle, customs, entryDate || null), [requester, vehicle, customs, entryDate]);
  const davMiss = davMissing(sections);
  const deadline = davDeadline(entryDate, stage, Boolean(customs.davNumber?.trim()));
  const regDeadline = registoDeadline(registration.plateDate);

  const setReq = (k: keyof Modelo9Requester, v: string) => setRequester((r) => ({ ...r, [k]: v }));
  const setVeh = (k: keyof Modelo9Vehicle, v: string) => setVehicle((x) => ({ ...x, [k]: v }));
  const setCustom = (k: string, v: string) => setCustoms((c) => ({ ...c, [k]: v }));
  const setReg = (k: string, v: string) => setRegistration((r) => ({ ...r, [k]: v }));

  function goTab(t: LegalTab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "modelo9") url.searchParams.delete("etapa");
    else url.searchParams.set("etapa", t);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function addDocs(ids: string[], kind: string) {
    if (!ids.length) return;
    const res = await run(() => addLegalizationDocuments(id, ids, kind), { quiet: true });
    if (res.ok) router.refresh();
  }

  function pickClient(cid: string) {
    setClientId(cid);
    const c = clients.find((x) => x.id === cid);
    if (c) setRequester(clientToRequester(c.data));
  }

  function pickCompany(c: CompanyPreset) {
    setRequester(c.requester);
    const nif = c.requester.nif.replace(/\D/g, "");
    setClientId(clients.find((x) => x.data.nif === nif)?.id ?? "");
  }

  async function pickCustomer(customerId: string) {
    setCustomerPick(customerId);
    if (!customerId) return;
    const res = await run(() => dealCustomer(customerId), { quiet: true });
    if (!res.ok) return;
    const c = res.data;
    setClientId("");
    setRequester({ kind: "particular", name: c.fullName, nif: c.nif, docNumber: c.idDocumentNumber, certCode: "", address: c.address, postalCode: c.postalCode, city: c.city, email: c.email, phone: c.phone });
  }

  async function generate() {
    if (!(await flush())) return;
    const res = await run(() => generateModelo9(id));
    if (res.ok) {
      setPdfUrl(res.data.url);
      if (status === "draft") setStatus("generated");
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
  const nextStage = STAGES[Math.min(stageIndex(stage) + 1, STAGES.length - 1)];
  const stepState = (s: Stage) => (stageIndex(stage) > stageIndex(s) ? "done" : stage === s ? "now" : "todo");
  const stepNote: Record<Exclude<Stage, "concluido">, string> = {
    modelo9: pdfUrl ? LEGALIZATION_STATUS[status] : missing.length ? `${missing.length} em falta` : "Pronto para gerar",
    alfandega: customs.davNumber ? `DAV ${customs.davNumber}` : deadlineText(deadline),
    registo: registration.ptPlate ? `Matrícula ${registration.ptPlate}` : "Por fazer",
  };
  const attachable = docs.filter((d) => d.kind !== "modelo9");

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <nav className="a-steps" aria-label="Etapas da legalização">
        {(["modelo9", "alfandega", "registo"] as const).map((s, i) => (
          <button key={s} type="button" className="a-step" data-state={stepState(s)} aria-current={tab === s ? "page" : undefined} onClick={() => goTab(s)}>
            <span className="a-step-n">{stepState(s) === "done" ? <Check size={14} /> : i + 1}</span>
            <span style={{ minWidth: 0 }}>
              <strong>{STAGE_LABEL[s]}</strong>
              <small>{stepNote[s]}</small>
            </span>
          </button>
        ))}
        <button type="button" className="a-step" aria-current={tab === "documentos" ? "page" : undefined} onClick={() => goTab("documentos")}>
          <span className="a-step-n">
            <FileText size={14} />
          </span>
          <span style={{ minWidth: 0 }}>
            <strong>Documentos</strong>
            <small>
              {docs.length} guardado{docs.length === 1 ? "" : "s"}
            </small>
          </span>
        </button>
      </nav>

      <div className="a-stage-bar">
        <p className="muted" aria-live="polite" style={{ fontSize: 13, margin: 0 }}>
          {saveState === "saving" ? "A guardar…" : saveState === "saved" ? "Tudo guardado." : saveState === "error" ? "Não foi possível guardar. Verifique a ligação." : "As alterações ficam guardadas sozinhas."}
        </p>
        <div className="a-actions">
          <label className="sr-only" htmlFor="f-stage">
            Etapa do carro
          </label>
          <select id="f-stage" className="a-input" style={{ width: "auto" }} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                Etapa: {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
          {stage !== "concluido" && (
            <button
              type="button"
              className="a-btn a-btn-sm a-btn-primary"
              onClick={() => {
                setStage(nextStage);
                if (nextStage !== "concluido") goTab(nextStage);
              }}
            >
              {nextStage === "concluido" ? "Marcar como concluído" : `Avançar para ${STAGE_LABEL[nextStage]}`} <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>

      {tab === "modelo9" && (
        <>
          <AiReader
            mode="import"
            target={{ ownerType: "none", kind: "livrete_estrangeiro" }}
            fields={VEHICLE_META}
            current={vehicle as unknown as Record<string, string>}
            onApply={(found) => setVehicle((v) => ({ ...v, ...found }))}
            onUploaded={(ids) => void addDocs(ids, "livrete_estrangeiro")}
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

          <section className="a-card">
            <div className="a-card-head">
              <div>
                <h2>2. Cliente (requerente)</h2>
                <p>Em nome de quem o carro fica registado. A ficha do cliente aprende com estes dados para o carro seguinte.</p>
              </div>
              {clientId && (
                <Link className="a-btn a-btn-sm" href={`/painel/legalizacao/clientes/${clientId}`}>
                  Ficha do cliente
                </Link>
              )}
            </div>
            <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
              <div className="a-fields">
                <Field label="Cliente" name="client" hint={clientId ? undefined : "Sem cliente: cria-se sozinho pelo NIF."} wide>
                  <select id="f-client" className="a-input" value={clientId} onChange={(e) => pickClient(e.target.value)}>
                    <option value="">— Novo cliente (pelos dados abaixo) —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="a-actions">
                {companies.map((c) => (
                  <button key={c.key} type="button" className="a-btn a-btn-sm" onClick={() => pickCompany(c)} aria-pressed={requester.nif === c.requester.nif && requester.kind === "empresa"}>
                    <Building2 size={15} /> {c.label}
                  </button>
                ))}
              </div>
              {customers.length > 0 && (
                <div className="a-field" style={{ maxWidth: 420 }}>
                  <label htmlFor="f-req-customer">Ou copiar de um cliente do stand</label>
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
            current={{ ...(requester as unknown as Record<string, string>), kind: "" }}
            onApply={(found) => setRequester((r) => ({ ...r, ...found }) as Modelo9Requester)}
            onUploaded={(ids) => void addDocs(ids, "identificacao")}
            intro="Outro cliente? Fotografe a certidão permanente da empresa ou o documento de identificação da pessoa."
          />

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
                <Field label="Estado do Modelo 9" name="status">
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
              {attachable.length ? (
                <>
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    O IMT só aceita PDF. Junte as fotografias num PDF no separador Documentos (escolha as que quer) ou descarregue já todas:
                  </p>
                  <div>
                    <a className="a-btn a-btn-sm" href={pdfLink(id, attachable)} target="_blank" rel="noopener">
                      <FileDown size={15} /> Descarregar {attachable.length} em PDF
                    </a>{" "}
                    <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => goTab("documentos")}>
                      Escolher no separador Documentos
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  Ainda não há fotografias. As que forem lidas nos passos 1 e 2 aparecem aqui.
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {tab === "alfandega" && (
        <CustomsStep
          legalizationId={id}
          customs={customs}
          setCustom={setCustom}
          entryDate={entryDate}
          setEntryDate={setEntryDate}
          sections={sections}
          missing={davMiss}
          deadline={deadline}
          docs={docs}
          onDocsAdded={addDocs}
        />
      )}

      {tab === "registo" && <RegistrationStep registration={registration} setReg={setReg} deadline={regDeadline} onDocsAdded={addDocs} />}

      {tab === "documentos" && <LegalizationDocuments legalizationId={id} docs={docs} />}

      <section className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <strong>Apagar processo</strong>
          <p className="muted" style={{ fontSize: 13 }}>
            Os ficheiros continuam guardados.
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
                  if (res.ok) router.push(clientId ? `/painel/legalizacao/clientes/${clientId}` : "/painel/legalizacao");
                }}
              >
                Apagar
              </button>
            </>
          }
        >
          <p>Apagar este carro da legalização? Os documentos deixam de aparecer aqui, mas os ficheiros ficam guardados.</p>
        </Dialog>
      </section>
    </div>
  );
}
