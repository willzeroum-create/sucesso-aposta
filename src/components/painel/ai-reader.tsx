"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, FileUp, Sparkles, X } from "lucide-react";
import { Alert, Spinner } from "./ui";
import { readWithAi, uploadDocuments } from "./upload";

export interface Proposal {
  documents: string[];
  legible: boolean;
  problem: string | null;
  summary: string;
  fields: Record<string, string | number>;
  warnings: string[];
}

export interface FieldMeta {
  key: string;
  label: string;
  format?: (v: string | number) => string;
}

/**
 * Fotografar/carregar documentos → ler com IA → rever campo a campo → aplicar ao formulário.
 * Os ficheiros ficam guardados como documentos (da viatura/cliente, ou soltos até à criação).
 */
export function AiReader({
  mode,
  target,
  fields,
  current,
  onApply,
  onUploaded,
  intro,
}: {
  mode: "vehicle" | "person";
  target: { ownerType: "vehicle" | "customer" | "none"; ownerId?: string; kind: string };
  fields: FieldMeta[];
  current: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
  onUploaded?: (fileIds: string[]) => void;
  intro: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading" | "review">("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [lastFiles, setLastFiles] = useState<string[]>([]);
  // Documentos juntos antes da leitura (frente, verso, comprovativo…): a leitura só começa no botão.
  const [queue, setQueue] = useState<{ file: File; url: string | null }[]>([]);
  const MAX = 8;

  const queueRef = useRef(queue);
  queueRef.current = queue;
  useEffect(() => () => queueRef.current.forEach((q) => q.url && URL.revokeObjectURL(q.url)), []);
  const clear = () => {
    queue.forEach((q) => q.url && URL.revokeObjectURL(q.url));
    setQueue([]);
  };

  function add(list: FileList | null) {
    // Copiar já: a FileList é "viva" e esvazia quando o input é limpo abaixo.
    const files = [...(list ?? [])];
    if (!files.length) return;
    setError(null);
    setProposal(null);
    if (stage === "review") setStage("idle");
    const room = Math.max(0, MAX - queue.length);
    const next = files.slice(0, room).map((file) => ({ file, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }));
    if (files.length > room) setError(`No máximo ${MAX} ficheiros por leitura.`);
    setQueue((q) => [...q, ...next]);
    if (input.current) input.current.value = "";
    if (camera.current) camera.current.value = "";
  }

  function remove(i: number) {
    setQueue((q) => {
      const item = q[i];
      if (item?.url) URL.revokeObjectURL(item.url);
      return q.filter((_, j) => j !== i);
    });
  }

  async function start() {
    if (!queue.length) return;
    setError(null);
    setProposal(null);
    try {
      setStage("uploading");
      const list = queue.map((q) => q.file);
      const uploaded = await uploadDocuments(list, target, (d, t) => setProgress(`A enviar ${d} de ${t}…`));
      const ids = uploaded.map((u) => u.fileId);
      setLastFiles(ids);
      onUploaded?.(ids);
      clear();
      await read(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no envio.");
      setStage("idle");
    }
  }

  async function read(ids: string[]) {
    try {
      setStage("reading");
      setProgress("A ler os documentos…");
      const { proposal: p, model: m } = await readWithAi<Proposal>(mode, ids);
      setProposal(p);
      setModel(m);
      // Por omissão aplica só o que está vazio ou é diferente; campos já preenchidos ficam desmarcados.
      setChosen(new Set(fields.filter((f) => p.fields[f.key] !== undefined && p.fields[f.key] !== "" && !current[f.key]).map((f) => f.key)));
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "A leitura falhou.");
      setStage("idle");
    }
  }

  const rows = proposal ? fields.filter((f) => proposal.fields[f.key] !== undefined && proposal.fields[f.key] !== "" && String(proposal.fields[f.key]) !== current[f.key]) : [];
  const same = proposal ? fields.filter((f) => proposal.fields[f.key] !== undefined && String(proposal.fields[f.key]) === current[f.key]).length : 0;

  return (
    <section className="a-card" aria-labelledby={`ai-${mode}`}>
      <div className="a-card-head">
        <div>
          <h2 id={`ai-${mode}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={17} aria-hidden="true" /> Preencher a partir de documentos
          </h2>
          <p>{intro}</p>
        </div>
        <div className="a-actions">
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
          <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => add(e.target.files)} />
          <button type="button" className="a-btn a-btn-sm" onClick={() => camera.current?.click()} disabled={stage === "uploading" || stage === "reading" || queue.length >= MAX}>
            <Camera size={15} /> Fotografar
          </button>
          <button type="button" className="a-btn a-btn-sm" onClick={() => input.current?.click()} disabled={stage === "uploading" || stage === "reading" || queue.length >= MAX}>
            <FileUp size={15} /> {queue.length ? "Adicionar ficheiros" : "Escolher ficheiros"}
          </button>
        </div>
      </div>
      {(stage !== "idle" || error || queue.length > 0) && (
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {queue.length > 0 && stage === "idle" && (
            <div style={{ display: "grid", gap: 12 }}>
              <p className="muted" style={{ fontSize: 13 }}>
                Junte todos os documentos (frente, verso, comprovativo de morada…) e carregue em ler. A IA cruza a informação de todos.
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 10 }}>
                {queue.map((q, i) => (
                  <li key={`${q.file.name}-${i}`} style={{ position: "relative", width: 112, display: "grid", gap: 4 }}>
                    {q.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.url} alt="" style={{ width: 112, height: 84, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }} />
                    ) : (
                      <span className="a-thumb-empty" style={{ width: 112, height: 84 }}>
                        <FileText size={22} />
                      </span>
                    )}
                    <span className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.file.name}
                    </span>
                    <button
                      type="button"
                      className="a-icon-btn"
                      onClick={() => remove(i)}
                      aria-label={`Retirar ${q.file.name}`}
                      style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, background: "var(--surface)", border: "1px solid var(--line)" }}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="a-actions">
                <button type="button" className="a-btn a-btn-primary" onClick={start}>
                  <Sparkles size={16} /> Ler {queue.length} documento{queue.length === 1 ? "" : "s"}
                </button>
                <button type="button" className="a-btn a-btn-ghost" onClick={clear}>
                  Limpar
                </button>
              </div>
            </div>
          )}
          {(stage === "uploading" || stage === "reading") && (
            <p style={{ display: "flex", gap: 8, alignItems: "center" }} aria-live="polite">
              <Spinner /> {progress} {stage === "reading" && <span className="muted">(pode demorar até 30 segundos)</span>}
            </p>
          )}
          {error && (
            <Alert kind="danger" title="Não foi possível ler">
              <p>{error}</p>
              {lastFiles.length > 0 && (
                <button type="button" className="a-btn a-btn-sm" style={{ marginTop: 8 }} onClick={() => read(lastFiles)}>
                  Tentar de novo
                </button>
              )}
            </Alert>
          )}
          {stage === "review" && proposal && (
            <>
              <p>
                <strong>{proposal.summary || "Leitura concluída."}</strong>{" "}
                <span className="muted" style={{ fontSize: 13 }}>
                  {model ? `Lido por ${model}. ` : ""}Confirme cada valor com o documento antes de guardar.
                </span>
              </p>
              {proposal.warnings.length > 0 && (
                <Alert kind="warn" title="Atenção">
                  <ul>
                    {proposal.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {rows.length ? (
                <fieldset className="a-fieldset">
                  <legend className="sr-only">Campos a aplicar</legend>
                  <div className="a-proposal">
                    {rows.map((f) => {
                      const v = proposal.fields[f.key];
                      return (
                        <label key={f.key}>
                          <input
                            type="checkbox"
                            checked={chosen.has(f.key)}
                            onChange={(e) => {
                              const next = new Set(chosen);
                              if (e.target.checked) next.add(f.key);
                              else next.delete(f.key);
                              setChosen(next);
                            }}
                          />
                          <span className="muted">{f.label}</span>
                          <span className="from">{current[f.key] ? (f.format ? f.format(current[f.key]) : current[f.key]) : "vazio"}</span>
                          <span className="to">{f.format ? f.format(v) : String(v)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <Alert kind="info">Os documentos não trouxeram dados novos{same ? ` (${same} campos já coincidem)` : ""}.</Alert>
              )}
              <div className="a-actions">
                {rows.length > 0 && (
                  <button
                    type="button"
                    className="a-btn a-btn-primary"
                    disabled={!chosen.size}
                    onClick={() => {
                      const values: Record<string, string> = {};
                      for (const k of chosen) values[k] = String(proposal.fields[k]);
                      onApply(values);
                      setStage("idle");
                      setProposal(null);
                    }}
                  >
                    Aplicar {chosen.size} campo{chosen.size === 1 ? "" : "s"} ao formulário
                  </button>
                )}
                <button type="button" className="a-btn" onClick={() => (setStage("idle"), setProposal(null))}>
                  Descartar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
