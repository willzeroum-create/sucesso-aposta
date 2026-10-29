"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { resetTemplate, saveCompany, savePrivacy, saveTemplate } from "@/app/painel/_actions/site";
import { PLACEHOLDERS } from "@/lib/form-templates";
import { Spinner, useAction, useToast } from "./ui";

type Input = { name: string; label: string; wide?: boolean; hint?: string; type?: string };

export function SimpleSettingsForm({ kind, initial, inputs }: { kind: "company" | "company_rent" | "privacy"; initial: Record<string, string>; inputs: Input[] }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  return (
    <form
      className="a-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const res = await run(() => (kind === "company" ? saveCompany(form, "sale") : kind === "company_rent" ? saveCompany(form, "rent") : savePrivacy(form)));
        if (res.ok) router.refresh();
      }}
    >
      <div className="a-fields">
        {inputs.map((i) => (
          <div key={i.name} className={`a-field${i.wide ? " wide" : ""}`}>
            <label htmlFor={`${kind}-${i.name}`}>{i.label}</label>
            {i.type === "textarea" ? (
              <textarea id={`${kind}-${i.name}`} name={i.name} defaultValue={initial[i.name] ?? ""} rows={3} />
            ) : (
              <input id={`${kind}-${i.name}`} name={i.name} type={i.type ?? "text"} defaultValue={initial[i.name] ?? ""} aria-invalid={Boolean(fields[i.name])} />
            )}
            {fields[i.name] ? <span className="a-error">{fields[i.name]}</span> : i.hint ? <span className="a-hint">{i.hint}</span> : null}
          </div>
        ))}
      </div>
      <div>
        <button className="a-btn a-btn-primary" disabled={pending}>
          {pending ? <Spinner /> : <Save size={16} />} Guardar
        </button>
      </div>
    </form>
  );
}

type WordFile = { name: string; uploadedAt: string; uploadedBy: string; fields: string[] } | null;

function WordTemplate({ id, word, hasExample }: { id: string; word: WordFile; hasExample: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch(`/api/admin/templates/${id}`, { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string; fields?: string[]; unknown?: string[] } | null;
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Falha no envio.");
      toast(
        json.unknown?.length ? "info" : "ok",
        json.unknown?.length
          ? `Modelo ativo com ${json.fields?.length} campos. Atenção: estes campos não existem e vão ficar em branco: ${json.unknown.join(", ")}.`
          : `Modelo ativo com ${json.fields?.length} campos. As próximas vendas usam este documento.`,
      );
      router.refresh();
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Deixar de usar este documento Word? Volta a ser usado o texto-base em PDF.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/templates/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      toast("ok", "Documento Word removido.");
      router.refresh();
    } else toast("danger", "Não foi possível remover.");
  }

  return (
    <div style={{ display: "grid", gap: 10, padding: 14, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)" }}>
      <input ref={input} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => upload(e.target.files)} />
      {word ? (
        <>
          <p style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <FileText size={18} /> <strong>Documento Word em uso: {word.name}</strong>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Carregado por {word.uploadedBy} em {new Date(word.uploadedAt).toLocaleString("pt-PT")} · {word.fields.length} campos preenchidos automaticamente. Cada venda gera, a partir deste Word, um PDF com os dados do comprador e da viatura.
          </p>
          <div className="a-actions">
            <a className="a-btn a-btn-sm" href={`/api/admin/templates/${id}`}>
              <Download size={15} /> Descarregar o modelo
            </a>
            <button type="button" className="a-btn a-btn-sm" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Spinner size={14} /> : <Upload size={15} />} Substituir pelo documento real
            </button>
            <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={remove} disabled={busy}>
              <Trash2 size={15} /> Deixar de usar
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <FileText size={18} /> <strong>Usar o vosso documento Word</strong>
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            Carregue o documento que o stand já usa (.docx), com os campos entre chavetas onde devem entrar os dados, por exemplo {"{{cliente.nome}}"}. Enquanto não houver documento Word, é usado o texto abaixo em PDF.
          </p>
          <div className="a-actions">
            <button type="button" className="a-btn a-btn-sm a-btn-primary" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? <Spinner size={14} /> : <Upload size={15} />} Carregar documento Word
            </button>
            {hasExample && (
              <a className="a-btn a-btn-sm" href={`/api/admin/templates/${id}?exemplo=1`}>
                <Download size={15} /> Descarregar exemplo para adaptar
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TemplateEditor({ id, title, body, customized, word, hasExample, open }: { id: string; title: string; body: string; customized: boolean; word: WordFile; hasExample: boolean; open?: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  return (
    <details className="a-card" open={open}>
      <summary className="a-card-head" style={{ cursor: "pointer", listStyle: "revert" }}>
        <h2 style={{ display: "inline" }}>{title}</h2>
        {word ? <span className="a-pill available plain">Documento Word</span> : customized && <span className="a-pill accent plain">Texto personalizado</span>}
      </summary>
      <div className="a-card-body a-form" style={{ gap: 14 }}>
        <WordTemplate id={id} word={word} hasExample={hasExample} />
        <p className="muted" style={{ fontSize: 13 }}>{word ? "Texto-base (só é usado se deixar de usar o documento Word):" : "Texto-base usado no PDF:"}</p>

        <div className="a-field">
          <label htmlFor={`t-${id}`}>Título</label>
          <input id={`t-${id}`} value={t} onChange={(e) => setT(e.target.value)} />
        </div>
        <div className="a-field">
          <label htmlFor={`b-${id}`}>Texto (parágrafos separados por uma linha em branco)</label>
          <textarea id={`b-${id}`} value={b} onChange={(e) => setB(e.target.value)} rows={14} style={{ fontSize: 14 }} />
        </div>
        <details>
          <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>
            Campos disponíveis
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} type="button" className="a-btn a-btn-sm" title={p.label} onClick={() => setB((x) => `${x}{{${p.key}}}`)}>
                {`{{${p.key}}}`}
              </button>
            ))}
          </div>
        </details>
        <div className="a-actions">
          <button type="button" className="a-btn a-btn-primary" disabled={pending} onClick={async () => (await run(() => saveTemplate(id, t, b))).ok && router.refresh()}>
            {pending ? <Spinner /> : <Save size={16} />} Guardar modelo
          </button>
          {customized && (
            <button type="button" className="a-btn" disabled={pending} onClick={async () => confirm("Repor o texto original deste modelo?") && (await run(() => resetTemplate(id))).ok && router.refresh()}>
              <RotateCcw size={16} /> Repor original
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
