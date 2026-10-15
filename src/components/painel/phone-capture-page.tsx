"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Images, Monitor } from "lucide-react";
import { shrinkImage } from "./upload";
import { Alert, Spinner } from "./ui";

type Sent = { url: string; ok: boolean; error?: string };

/** Página do telemóvel: fotografa e envia para o ecrã do computador que mostrou o código QR. */
export function PhoneCapturePage({ token, valid, what, photos, already, place }: { token: string; valid: boolean; what: string; photos: boolean; already: number; place: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  async function send(list: FileList | null) {
    const files = [...(list ?? [])];
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
    for (const [i, original] of files.entries()) {
      setBusy(files.length > 1 ? `A enviar ${i + 1} de ${files.length}…` : "A enviar…");
      const preview = original.type.startsWith("image/") ? URL.createObjectURL(original) : "";
      try {
        const file = await shrinkImage(original);
        const form = new FormData();
        form.append("files", file, file.name);
        const res = await fetch(`/api/capture/${token}`, { method: "POST", body: form });
        const json = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
        if (!res.ok || !json?.ok) {
          const error = json?.error ?? "Não foi possível enviar. Tente de novo.";
          setSent((s) => [...s, { url: preview, ok: false, error }]);
          if (/expirou|Gere outro/.test(error)) {
            setFatal(error);
            break;
          }
        } else setSent((s) => [...s, { url: preview, ok: true }]);
      } catch {
        setSent((s) => [...s, { url: preview, ok: false, error: "Sem ligação. Tente de novo." }]);
      }
    }
    setBusy(null);
  }

  if (!valid)
    return (
      <div className="a-login-card" style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 22 }}>Código expirado</h1>
        <p className="muted">Este código QR já não é válido. No computador, carregue outra vez em “Fotografar” para gerar um novo.</p>
      </div>
    );

  const okCount = sent.filter((s) => s.ok).length + already;
  return (
    <div className="a-login-card" style={{ display: "grid", gap: 16, width: "min(440px, 100%)" }}>
      <div>
        <h1 style={{ fontSize: 22 }}>Fotografar {what}</h1>
        {place && <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{place}</p>}
        <p className="muted" style={{ marginTop: 4 }}>
          As fotografias aparecem sozinhas no ecrã do computador.{photos ? "" : " Tire uma fotografia por documento (frente e verso separados), com boa luz e sem reflexos."}
        </p>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void send(e.target.files)} />
      <input ref={gallery} type="file" accept={photos ? "image/*" : "image/*,application/pdf"} multiple hidden onChange={(e) => void send(e.target.files)} />
      <button type="button" className="a-btn a-btn-primary" style={{ minHeight: 56, fontSize: 17 }} onClick={() => camera.current?.click()} disabled={Boolean(busy) || Boolean(fatal)}>
        {busy ? <Spinner /> : <Camera size={20} />} {busy ?? "Tirar fotografia"}
      </button>
      <button type="button" className="a-btn" style={{ minHeight: 48 }} onClick={() => gallery.current?.click()} disabled={Boolean(busy) || Boolean(fatal)}>
        <Images size={18} /> Escolher da galeria
      </button>
      {fatal && <Alert kind="danger">{fatal}</Alert>}
      {sent.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {sent.map((s, i) => (
            <li key={i} style={{ position: "relative", aspectRatio: "4 / 3", borderRadius: 8, overflow: "hidden", border: `2px solid ${s.ok ? "var(--ok)" : "var(--danger)"}`, background: "var(--surface-2)" }} title={s.error}>
              {s.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              {s.ok && <CheckCircle2 size={20} style={{ position: "absolute", right: 4, bottom: 4, color: "var(--ok)", background: "var(--surface)", borderRadius: 999 }} />}
            </li>
          ))}
        </ul>
      )}
      {sent.some((s) => !s.ok && !fatal) && <Alert kind="warn">{sent.filter((s) => !s.ok).at(-1)?.error}</Alert>}
      {okCount > 0 && (
        <p style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
          <Monitor size={18} aria-hidden="true" /> {okCount} enviada{okCount === 1 ? "" : "s"}. Já pode continuar no computador.
        </p>
      )}
    </div>
  );
}
