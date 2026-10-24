"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ClipboardList, Copy, Download, ExternalLink, Eye, FileDown, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { addLegalizationDocuments, deleteLegalizationDocument, setLegalizationDocumentKind } from "@/app/painel/_actions/legalizations";
import { DOCUMENT_KINDS, LEGALIZATION_DOCUMENT_KINDS } from "@/lib/document-kinds";
import { dateTime } from "@/lib/labels";
import {
  CUSTOMS_GROUPS,
  DAV_DOCUMENTS,
  REGISTRATION_GROUPS,
  davText,
  deadlineText,
  type DavDeadline,
  type DavField,
  type DavSection,
} from "@/lib/legalizacao";
import { AiReader, type FieldMeta } from "./ai-reader";
import { CaptureDialog, useIsDesktop } from "./capture-dialog";
import { Alert, Field, Spinner, useAction, useToast } from "./ui";
import { uploadDocuments } from "./upload";

export type LegalDoc = { id: string; kind: string; label: string; fileId: string; mime: string; name: string; createdAt: string };

/** Nome curto de cada documento no ficheiro PDF (o portal da DAV não aceita acentos nem espaços). */
const SHORT: Record<string, string> = {
  livrete_estrangeiro: "LIVRETE", fatura: "FATURA", identificacao: "NIF", coc: "COC", modelo9_assinado: "MODELO9", modelo9: "MODELO9",
  inspecao_b: "MODELO112", transporte: "CMR", exportacao: "EXPORTACAO", homologacao: "HOMOLOGACAO", dav: "DAV", isv: "ISV", registo: "REGISTO", dua: "DUA",
};
export const pdfLink = (legalizationId: string, docs: LegalDoc[], kind?: string) =>
  `/api/admin/legalizations/${legalizationId}/pdf?ids=${docs.map((d) => d.fileId).join(",")}${kind && SHORT[kind] ? `&nome=${SHORT[kind]}` : ""}`;

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, value: string) =>
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  return { copied, copy };
}

function CustomInput({ field, value, onChange, prefix }: { field: { key: string; label: string; casa?: string; type?: string; options?: [string, string][]; hint?: string; wide?: boolean; placeholder?: string }; value: string; onChange: (v: string) => void; prefix: string }) {
  const id = `${prefix}-${field.key}`;
  const label = field.casa ? `${field.label} (${field.casa})` : field.label;
  return (
    <Field label={label} name={id} hint={field.hint} wide={field.wide}>
      {field.type === "select" ? (
        <select id={`f-${id}`} className="a-input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options!.map(([code, text]) => (
            <option key={code} value={code}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`f-${id}`}
          type={field.type === "date" ? "date" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.key === "ptPlate" ? e.target.value.toUpperCase() : e.target.value)}
        />
      )}
    </Field>
  );
}

/* ───────────── Etapa 2: Alfândega (DAV) ───────────── */

const CUSTOMS_META: FieldMeta[] = [
  { key: "entryDate", label: "Data de entrada", important: true },
  ...CUSTOMS_GROUPS.flatMap((g) => g.fields)
    .filter((f) => !["davNumber", "davSubmittedAt", "isvEur", "ducNumber", "isvDueDate", "isvPaidAt", "foreignCertDepositAt"].includes(f.key))
    .map((f) => ({ key: f.key, label: f.label, important: ["sellerName", "invoiceNumber", "invoiceDate", "purchasePrice"].includes(f.key) })),
];

export function CustomsStep({
  legalizationId,
  customs,
  setCustom,
  entryDate,
  setEntryDate,
  sections,
  missing,
  deadline,
  docs,
  onDocsAdded,
}: {
  legalizationId: string;
  customs: Record<string, string>;
  setCustom: (key: string, value: string) => void;
  entryDate: string;
  setEntryDate: (v: string) => void;
  sections: DavSection[];
  missing: DavField[];
  deadline: DavDeadline;
  docs: LegalDoc[];
  onDocsAdded: (ids: string[], kind: string) => Promise<void>;
}) {
  const { copied, copy } = useCopy();
  const groups = CUSTOMS_GROUPS.filter((g) => g.title !== "Depois de submeter");
  const result = CUSTOMS_GROUPS.find((g) => g.title === "Depois de submeter")!;
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {deadline.state !== "sem_data" && deadline.state !== "submetida" && (
        <Alert kind={deadline.state === "atrasado" ? "danger" : deadline.state === "atencao" ? "warn" : "info"} title={deadlineText(deadline)}>
          <p>A DAV tem de ser submetida até 20 dias úteis depois da entrada do carro em Portugal (feriados não descontados).</p>
        </Alert>
      )}
      {deadline.state === "sem_data" && (
        <Alert kind="warn" title="Falta a data de entrada em Portugal">
          <p>É ela que conta o prazo de 20 dias úteis da DAV. Carro transportado: a data de receção no CMR.</p>
        </Alert>
      )}

      <AiReader
        mode="customs"
        target={{ ownerType: "none", kind: "fatura" }}
        fields={CUSTOMS_META}
        current={{ ...customs, entryDate }}
        onApply={(found) => {
          for (const [k, v] of Object.entries(found)) {
            if (k === "entryDate") setEntryDate(v);
            else setCustom(k, v);
          }
        }}
        onUploaded={(ids) => void onDocsAdded(ids, "fatura")}
        title="Fatura, CMR e conta-quilómetros"
        idSuffix="-dav"
        intro="Fotografe a fatura de compra, o CMR (guia de transporte) e o conta-quilómetros. A IA preenche vendedor, fatura, preço, transportadora, data de entrada e km."
      />

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Dados para a DAV</h2>
            <p>O que não vem no livrete nem no Modelo 9. O número entre parênteses é a casa da DAV.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 18 }}>
          {groups.map((g, i) => (
            <fieldset key={g.title} className="a-fieldset">
              <legend>{g.title}</legend>
              {g.hint && (
                <p className="muted" style={{ fontSize: 13, margin: "0 0 10px" }}>
                  {g.hint}
                </p>
              )}
              <div className="a-fields">
                {i === 0 && (
                  <Field label="Data de entrada em Portugal (66)" name="dav-entryDate" hint="Conta o prazo de 20 dias úteis">
                    <input id="f-dav-entryDate" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                  </Field>
                )}
                {g.fields.map((f) => (
                  <CustomInput key={f.key} field={f} value={customs[f.key] ?? ""} onChange={(v) => setCustom(f.key, v)} prefix="dav" />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ClipboardList size={17} aria-hidden="true" /> Casas da DAV
            </h2>
            <p>Abra a DAV no Portal das Finanças (Serviços Aduaneiros › IEC/ISV › DAV) e copie cada casa. Nas listas, «Copiar» copia o código.</p>
          </div>
          <div className="a-actions">
            {missing.length ? <span className="a-pill danger">{missing.length} em falta</span> : <span className="a-pill available">Completo</span>}
            <button type="button" className="a-btn a-btn-sm" onClick={() => copy("__all", davText(sections))}>
              {copied === "__all" ? <Check size={15} /> : <Copy size={15} />} Copiar tudo
            </button>
            <a className="a-btn a-btn-sm" href="https://www.portaldasfinancas.gov.pt/" target="_blank" rel="noopener">
              <ExternalLink size={15} /> Portal das Finanças
            </a>
          </div>
        </div>
        {missing.length > 0 && (
          <div className="a-card-body" style={{ paddingTop: 0 }}>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Em falta: {missing.map((m) => `${m.casa} ${m.label}`).join(" · ")}.
            </p>
          </div>
        )}
        {sections.map((s) => (
          <div key={s.title}>
            <div className="a-casa-title">{s.title}</div>
            {s.fields.map((x) => (
              <div key={x.casa} className="a-casa" data-missing={x.required && !x.value.trim() ? "true" : undefined}>
                <b>{x.casa}</b>
                <span style={{ minWidth: 0 }}>
                  <small>
                    {x.label}
                    {x.required ? " *" : ""}
                  </small>
                  <strong>{x.value || "—"}</strong>
                  {x.hint && <small>{x.hint}</small>}
                </span>
                <button type="button" className="a-btn a-btn-sm" onClick={() => copy(x.casa, x.copy || x.value)} disabled={!(x.copy || x.value)} aria-label={`Copiar casa ${x.casa}`}>
                  {copied === x.casa ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Documentos a anexar (casa 92)</h2>
            <p>PDF, ZIP ou JPEG, com nomes sem acentos nem espaços: cada botão junta as fotografias desse documento num PDF já com o nome certo.</p>
          </div>
        </div>
        <div className="a-docs">
          {DAV_DOCUMENTS.map((d) => {
            const mine = docs.filter((x) => x.kind === d.kind || (d.kind === "modelo9_assinado" && x.kind === "modelo9"));
            return (
              <div key={d.kind} className="a-doc" style={{ gridTemplateColumns: "auto minmax(0, 1fr) auto" }}>
                <span className="a-doc-icon" aria-hidden="true">
                  {mine.length ? <Check size={18} /> : <FileText size={18} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong>{d.label}</strong>
                  <small style={{ display: "block" }}>{mine.length ? `${mine.length} ficheiro${mine.length === 1 ? "" : "s"}` : d.required ? "Ainda não carregado" : "Se se aplicar"}</small>
                </span>
                {mine.length ? (
                  <a className="a-btn a-btn-sm" href={pdfLink(legalizationId, mine, d.kind)} target="_blank" rel="noopener">
                    <FileDown size={15} /> PDF
                  </a>
                ) : (
                  <span className={`a-pill ${d.required ? "danger" : "neutral"}`}>{d.required ? "Falta" : "—"}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="a-card-body" style={{ borderTop: "1px solid var(--line)" }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Faltam documentos? Carregue-os no separador Documentos (escolha o tipo antes de fotografar).
          </p>
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Depois de submeter</h2>
            <p>{result.hint}</p>
          </div>
        </div>
        <div className="a-card-body a-fields">
          {result.fields.map((f) => (
            <CustomInput key={f.key} field={f} value={customs[f.key] ?? ""} onChange={(v) => setCustom(f.key, v)} prefix="dav" />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ───────────── Etapa 3: Registo inicial ───────────── */

const REGISTO_META: FieldMeta[] = [
  { key: "regType", label: "Onde foi feito" },
  { key: "ptPlate", label: "Matrícula portuguesa", important: true },
  { key: "holderName", label: "Titular registado", important: true },
  { key: "regDate", label: "Data do registo", important: true },
  { key: "regNumber", label: "Nº de apresentação / pedido" },
];

export function RegistrationStep({
  registration,
  setReg,
  deadline,
  onDocsAdded,
}: {
  registration: Record<string, string>;
  setReg: (key: string, value: string) => void;
  deadline: string | null;
  onDocsAdded: (ids: string[], kind: string) => Promise<void>;
}) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {deadline && !registration.regDate && (
        <Alert kind={deadline < new Date().toISOString().slice(0, 10) ? "danger" : "info"} title={`Registo de propriedade até ${deadline.split("-").reverse().join("/")}`}>
          <p>60 dias a contar da atribuição da matrícula. Fora do prazo o emolumento paga-se a dobrar.</p>
        </Alert>
      )}
      <AiReader
        mode="registo"
        target={{ ownerType: "none", kind: "registo" }}
        fields={REGISTO_META}
        current={registration}
        onApply={(found) => {
          for (const [k, v] of Object.entries(found)) if (REGISTO_META.some((m) => m.key === k)) setReg(k, v);
        }}
        onUploaded={(ids) => void onDocsAdded(ids, "registo")}
        title="Comprovativo do registo"
        idSuffix="-registo"
        intro="Fotografe o comprovativo da conservatória ou o requerimento do Automóvel Online (todas as páginas). A IA preenche matrícula, titular, data e número."
      />
      {REGISTRATION_GROUPS.map((g) => (
        <section key={g.title} className="a-card">
          <div className="a-card-head">
            <div>
              <h2>{g.title}</h2>
              {g.hint && <p>{g.hint}</p>}
            </div>
          </div>
          <div className="a-card-body a-fields">
            {g.fields.map((f) => (
              <CustomInput key={f.key} field={f} value={registration[f.key] ?? ""} onChange={(v) => setReg(f.key, v)} prefix="reg" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ───────────── Documentos do carro ───────────── */

const GROUPS: { title: string; kinds: string[] }[] = [
  { title: "Do cliente e do carro", kinds: ["livrete_estrangeiro", "coc", "fatura", "identificacao", "exportacao", "transporte"] },
  { title: "Modelo 9, homologação e inspeção", kinds: ["modelo9", "modelo9_assinado", "homologacao", "inspecao_b"] },
  { title: "Alfândega", kinds: ["dav", "isv"] },
  { title: "Registo inicial", kinds: ["registo", "dua"] },
];

export function LegalizationDocuments({ legalizationId, docs }: { legalizationId: string; docs: LegalDoc[] }) {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("livrete_estrangeiro");
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const desktop = useIsDesktop();
  const [capturing, setCapturing] = useState(false);

  async function link(ids: string[], k: string) {
    const res = await run(() => addLegalizationDocuments(legalizationId, ids, k), { quiet: true });
    if (res.ok) {
      toast("ok", `${ids.length} documento(s) guardado(s).`);
      router.refresh();
    }
  }

  async function upload(files: FileList | File[] | null) {
    if (!files?.length) return;
    try {
      const done = await uploadDocuments([...files], { ownerType: "none", kind }, (d, t) => setBusy(`A enviar ${d} de ${t}…`));
      await link(done.map((d) => d.fileId), kind);
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  const other = docs.filter((d) => !GROUPS.some((g) => g.kinds.includes(d.kind)));
  const groups = [...GROUPS.map((g) => ({ title: g.title, docs: docs.filter((d) => g.kinds.includes(d.kind)) })), { title: "Outros", docs: other }].filter((g) => g.docs.length);
  const pickedDocs = docs.filter((d) => picked.has(d.id));

  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Documentos do carro</h2>
          <p>Tudo o que é deste carro fica aqui guardado. Escolha o tipo antes de fotografar ou carregar.</p>
        </div>
      </div>
      <div className="a-card-body" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label className="sr-only" htmlFor="leg-doc-kind">
          Tipo de documento
        </label>
        <select id="leg-doc-kind" className="a-input" style={{ width: "auto", maxWidth: "100%" }} value={kind} onChange={(e) => setKind(e.target.value)}>
          {LEGALIZATION_DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {DOCUMENT_KINDS[k]}
            </option>
          ))}
        </select>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
        <button type="button" className="a-btn a-btn-sm" onClick={() => (desktop ? setCapturing(true) : camera.current?.click())} disabled={!!busy}>
          <Camera size={15} /> Fotografar
        </button>
        <button type="button" className="a-btn a-btn-sm" onClick={() => input.current?.click()} disabled={!!busy}>
          {busy ? <Spinner size={14} /> : <Upload size={15} />} {busy ?? "Escolher ficheiros"}
        </button>
        <CaptureDialog
          open={capturing}
          onClose={() => setCapturing(false)}
          target={{ ownerType: "none", kind }}
          onRemoteFiles={(files) => void link(files.map((f) => f.id), kind)}
          onWebcamFile={(f) => void upload([f])}
        />
      </div>
      {groups.length ? (
        groups.map((g) => (
          <div key={g.title}>
            <div className="a-casa-title">{g.title}</div>
            <div className="a-docs">
              {g.docs.map((d) => (
                <div className="a-doc" key={d.id} style={{ gridTemplateColumns: "auto auto minmax(0, 1fr) auto" }}>
                  <input
                    type="checkbox"
                    aria-label={`Escolher ${d.label}`}
                    checked={picked.has(d.id)}
                    onChange={(e) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (e.target.checked) n.add(d.id);
                        else n.delete(d.id);
                        return n;
                      })
                    }
                  />
                  <span className="a-doc-icon">{d.mime === "application/pdf" ? <FileText size={18} /> : <ImageIcon size={18} />}</span>
                  <div style={{ minWidth: 0 }}>
                    <select
                      className="a-input"
                      style={{ width: "auto", maxWidth: "100%", minHeight: 28, padding: "2px 6px", fontSize: 13.5, fontWeight: 600, border: "1px solid transparent", background: "transparent" }}
                      value={d.kind}
                      aria-label="Tipo de documento"
                      onChange={async (e) => (await run(() => setLegalizationDocumentKind(d.id, e.target.value), { quiet: true })).ok && router.refresh()}
                    >
                      {LEGALIZATION_DOCUMENT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {DOCUMENT_KINDS[k]}
                        </option>
                      ))}
                    </select>
                    <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name} · {dateTime(d.createdAt)}
                    </small>
                  </div>
                  <div className="a-actions" style={{ gap: 2 }}>
                    <a className="a-icon-btn" href={`/api/admin/files/${d.fileId}`} target="_blank" rel="noopener" aria-label="Abrir documento">
                      <Eye size={16} />
                    </a>
                    <a className="a-icon-btn" href={`/api/admin/files/${d.fileId}?download=1`} aria-label="Descarregar documento">
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      className="a-icon-btn"
                      aria-label="Apagar documento"
                      disabled={pending}
                      onClick={async () => {
                        if (!confirm(`Apagar "${d.label}"? Esta ação não pode ser desfeita.`)) return;
                        if ((await run(() => deleteLegalizationDocument(d.id))).ok) router.refresh();
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="a-empty">
          <strong>Ainda não há documentos.</strong>
          Livrete, CoC, fatura, CMR, Modelo 9, DAV, registo… tudo fica guardado aqui.
        </div>
      )}
      {pickedDocs.length > 0 && (
        <div className="a-form-foot" style={{ margin: 0 }}>
          <a className="a-btn a-btn-primary" href={pdfLink(legalizationId, pickedDocs)} target="_blank" rel="noopener">
            <FileDown size={16} /> Juntar {pickedDocs.length} em PDF
          </a>
          <button type="button" className="a-btn a-btn-ghost" onClick={() => setPicked(new Set())}>
            Limpar escolha
          </button>
        </div>
      )}
    </section>
  );
}
