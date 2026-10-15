"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Download, Eye, FileText, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import { deleteDocument, setDocumentKind } from "@/app/painel/_actions/customers";
import { DOCUMENT_KINDS, type DocumentKind } from "@/lib/document-kinds";
import { dateOnly, dateTime } from "@/lib/labels";
import { uploadDocuments } from "./upload";
import { Spinner, useAction, useToast } from "./ui";

export type DocRow = {
  id: string;
  kind: string;
  label: string;
  fileId: string;
  mime: string;
  originalName: string;
  size: number;
  createdAt: string;
  expiresOn: string | null;
  extractionStatus: string;
  summary?: string | null;
};

export function DocumentsPanel({
  owner,
  docs,
  kinds,
  canUpload,
}: {
  owner: { type: "vehicle" | "customer"; id: string };
  docs: DocRow[];
  kinds: DocumentKind[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>(kinds[0]);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    try {
      await uploadDocuments([...files], { ownerType: owner.type, ownerId: owner.id, kind }, (d, t) => setBusy(`A enviar ${d} de ${t}…`));
      toast("ok", "Documento(s) guardado(s).");
      router.refresh();
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Documentos</h2>
          <p>Privados: só a equipa com permissão os pode abrir.</p>
        </div>
        {canUpload && (
          <div className="a-actions">
            <label className="sr-only" htmlFor={`kind-${owner.id}`}>
              Tipo de documento
            </label>
            <select id={`kind-${owner.id}`} className="a-input" style={{ width: "auto", minHeight: 32, fontSize: 13 }} value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KINDS[k]}
                </option>
              ))}
            </select>
            <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => upload(e.target.files)} />
            <button type="button" className="a-btn a-btn-sm" onClick={() => camera.current?.click()} disabled={!!busy}>
              <Camera size={15} /> Fotografar
            </button>
            <button type="button" className="a-btn a-btn-sm" onClick={() => input.current?.click()} disabled={!!busy}>
              {busy ? <Spinner size={14} /> : <Upload size={15} />} {busy ?? "Carregar"}
            </button>
          </div>
        )}
      </div>
      {docs.length ? (
        <div className="a-docs">
          {docs.map((d) => {
            const expired = d.expiresOn && d.expiresOn < today;
            return (
              <div className="a-doc" key={d.id}>
                <span className="a-doc-icon">{d.mime === "application/pdf" ? <FileText size={18} /> : <ImageIcon size={18} />}</span>
                <div style={{ minWidth: 0 }}>
                  {canUpload ? (
                    <select
                      className="a-input"
                      style={{ width: "auto", minHeight: 28, padding: "2px 6px", fontSize: 13.5, fontWeight: 600, border: "1px solid transparent", background: "transparent" }}
                      value={d.kind}
                      aria-label="Tipo de documento"
                      onChange={async (e) => (await run(() => setDocumentKind(d.id, e.target.value, d.expiresOn), { quiet: true })).ok && router.refresh()}
                    >
                      {Object.entries(DOCUMENT_KINDS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <strong>{d.label}</strong>
                  )}
                  <small style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.summary ? `${d.summary} · ` : ""}
                    {d.originalName} · {(d.size / 1024 / 1024).toFixed(1)} MB · {dateTime(d.createdAt)}
                  </small>
                  {(d.expiresOn || canUpload) && (
                    <small style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                      Validade:
                      {canUpload ? (
                        <input
                          type="date"
                          defaultValue={d.expiresOn ?? ""}
                          aria-label="Data de validade"
                          style={{ border: 0, background: "transparent", color: expired ? "var(--danger)" : "inherit", font: "inherit" }}
                          onBlur={(e) => e.target.value !== (d.expiresOn ?? "") && run(() => setDocumentKind(d.id, d.kind, e.target.value || null), { quiet: true })}
                        />
                      ) : (
                        <span style={{ color: expired ? "var(--danger)" : undefined }}>{dateOnly(d.expiresOn)}</span>
                      )}
                      {expired && <span className="a-pill danger plain">Caducado</span>}
                    </small>
                  )}
                </div>
                <div className="a-actions" style={{ gap: 2 }}>
                  <a className="a-icon-btn" href={`/api/admin/files/${d.fileId}`} target="_blank" rel="noopener" aria-label="Abrir documento">
                    <Eye size={16} />
                  </a>
                  <a className="a-icon-btn" href={`/api/admin/files/${d.fileId}?download=1`} aria-label="Descarregar documento">
                    <Download size={16} />
                  </a>
                  {canUpload && (
                    <button
                      type="button"
                      className="a-icon-btn"
                      aria-label="Apagar documento"
                      disabled={pending}
                      onClick={async () => {
                        if (!confirm(`Apagar "${d.label}"? Esta ação não pode ser desfeita.`)) return;
                        if ((await run(() => deleteDocument(d.id))).ok) router.refresh();
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="a-empty">
          <strong>Sem documentos.</strong>
          {owner.type === "vehicle" ? "Guarde aqui o DUA, a fatura de compra, o CoC e as inspeções." : "Guarde aqui o documento de identificação e o comprovativo de morada."}
        </div>
      )}
    </section>
  );
}
