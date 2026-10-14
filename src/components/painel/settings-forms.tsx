"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save } from "lucide-react";
import { resetTemplate, saveCompany, savePrivacy, saveTemplate } from "@/app/painel/_actions/site";
import { PLACEHOLDERS } from "@/lib/form-templates";
import { Spinner, useAction } from "./ui";

type Input = { name: string; label: string; wide?: boolean; hint?: string; type?: string };

export function SimpleSettingsForm({ kind, initial, inputs }: { kind: "company" | "privacy"; initial: Record<string, string>; inputs: Input[] }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  return (
    <form
      className="a-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const res = await run(() => (kind === "company" ? saveCompany(form) : savePrivacy(form)));
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

export function TemplateEditor({ id, title, body, customized }: { id: string; title: string; body: string; customized: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);
  return (
    <details className="a-card">
      <summary className="a-card-head" style={{ cursor: "pointer", listStyle: "revert" }}>
        <h2 style={{ display: "inline" }}>{title}</h2>
        {customized && <span className="a-pill accent plain">Personalizado</span>}
      </summary>
      <div className="a-card-body a-form" style={{ gap: 14 }}>
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
