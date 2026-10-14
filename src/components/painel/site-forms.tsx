"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { deleteHero, moveHero, saveHero, saveSiteConfig, setHeroPublished } from "@/app/painel/_actions/site";
import { Dialog, Spinner, useAction } from "./ui";

export function SiteConfigForm({ initial }: { initial: Record<string, string> }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  return (
    <form
      className="a-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if ((await run(() => saveSiteConfig(form))).ok) router.refresh();
      }}
    >
      <div className="a-fields">
        {[
          ["name", "Nome do stand", "", true],
          ["tagline", "Frase de apresentação", "", true],
          ["phone", "Telefone", "+351…", false],
          ["whatsapp", "WhatsApp", "351…", false],
          ["email", "E-mail", "", false],
          ["address", "Morada", "", false],
        ].map(([name, label, ph, req]) => (
          <div className={`a-field${name === "tagline" || name === "address" ? " wide" : ""}`} key={name as string}>
            <label htmlFor={`s-${name}`}>{label as string}</label>
            <input id={`s-${name}`} name={name as string} defaultValue={initial[name as string] ?? ""} placeholder={ph as string} required={req as boolean} aria-invalid={Boolean(fields[name as string])} />
            {fields[name as string] ? <span className="a-error">{fields[name as string]}</span> : null}
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        Deixe vazios os contactos que ainda não existem: o site esconde-os. Não publique números ou moradas provisórios.
      </p>
      <div>
        <button className="a-btn a-btn-primary" disabled={pending}>
          {pending ? <Spinner /> : <Save size={16} />} Guardar
        </button>
      </div>
    </form>
  );
}

export type HeroRow = {
  id: string;
  vehicleId: string;
  vehicleLabel: string;
  imageDesktop: string;
  imageMobile: string;
  objectPositionDesktop: string;
  objectPositionMobile: string;
  textTone: "light" | "dark";
  eyebrow: string;
  headline: string;
  headlineAccent: string | null;
  description: string;
  published: boolean;
};
export type HeroVehicle = { id: string; label: string; published: boolean; photos: string[] };

const parsePos = (p: string): [number, number] => {
  const m = p.match(/^([\d.]+)% ([\d.]+)%$/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
};

function Preview({ image, pos, tone, eyebrow, headline, accent, mobile }: { image: string; pos: string; tone: "light" | "dark"; eyebrow: string; headline: string; accent: string; mobile?: boolean }) {
  return (
    <div className={`a-hero-preview${mobile ? " mobile" : ""} tone-${tone}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={image} alt="" style={{ objectPosition: pos }} />}
      <div className={`copy ${tone}`} style={{ zIndex: 1 }}>
        <small>{eyebrow}</small>
        <strong>
          {headline} {accent}
        </strong>
      </div>
    </div>
  );
}

export function HeroManager({ heroes, vehicles }: { heroes: HeroRow[]; vehicles: HeroVehicle[] }) {
  const router = useRouter();
  const { pending, fields, run } = useAction();
  const [edit, setEdit] = useState<HeroRow | null>(null);
  const [draft, setDraft] = useState<Omit<HeroRow, "id" | "vehicleLabel" | "published" | "headlineAccent"> & { headlineAccent: string }>();

  function open(h: HeroRow | "new") {
    const v = h === "new" ? vehicles.find((x) => x.published && x.photos.length) ?? vehicles[0] : null;
    setEdit(h === "new" ? ({ id: "" } as HeroRow) : h);
    setDraft(
      h === "new"
        ? {
            vehicleId: v?.id ?? "",
            imageDesktop: v?.photos[0] ?? "",
            imageMobile: v?.photos[0] ?? "",
            objectPositionDesktop: "50% 50%",
            objectPositionMobile: "50% 50%",
            textTone: "light",
            eyebrow: "",
            headline: "",
            headlineAccent: "",
            description: "",
          }
        : { ...h, headlineAccent: h.headlineAccent ?? "" },
    );
  }

  const photos = vehicles.find((v) => v.id === draft?.vehicleId)?.photos ?? [];
  const setD = (patch: Partial<NonNullable<typeof draft>>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const [dx, dy] = parsePos(draft?.objectPositionDesktop ?? "50% 50%");
  const [mx, my] = parsePos(draft?.objectPositionMobile ?? "50% 50%");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="a-actions">
        <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={() => open("new")} disabled={!vehicles.some((v) => v.photos.length)}>
          <Plus size={15} /> Nova capa
        </button>
        {!vehicles.some((v) => v.photos.length) && <span className="muted" style={{ fontSize: 13 }}>Carregue fotografias numa viatura para criar capas.</span>}
      </div>
      {heroes.length ? (
        <div className="a-grid-3">
          {heroes.map((h, i) => (
            <article key={h.id} className="a-card" style={{ overflow: "hidden" }}>
              <Preview image={h.imageDesktop} pos={h.objectPositionDesktop} tone={h.textTone} eyebrow={h.eyebrow} headline={h.headline} accent={h.headlineAccent ?? ""} />
              <div className="a-card-body" style={{ display: "grid", gap: 8, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 14 }}>{h.vehicleLabel}</strong>
                  <span className={`a-pill ${h.published ? "available" : "neutral"}`}>{h.published ? "No site" : "Rascunho"}</span>
                </div>
                <div className="a-actions" style={{ gap: 2 }}>
                  <button type="button" className="a-icon-btn" onClick={() => open(h)} aria-label="Editar capa">
                    <Pencil size={16} />
                  </button>
                  <button type="button" className="a-icon-btn" disabled={pending} onClick={async () => (await run(() => setHeroPublished(h.id, !h.published))).ok && router.refresh()} aria-label={h.published ? "Retirar do site" : "Publicar no site"} title={h.published ? "Retirar do site" : "Publicar no site"}>
                    {h.published ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button type="button" className="a-icon-btn" disabled={pending || i === 0} onClick={async () => (await run(() => moveHero(h.id, -1), { quiet: true })).ok && router.refresh()} aria-label="Subir">
                    <ArrowUp size={16} />
                  </button>
                  <button type="button" className="a-icon-btn" disabled={pending || i === heroes.length - 1} onClick={async () => (await run(() => moveHero(h.id, 1), { quiet: true })).ok && router.refresh()} aria-label="Descer">
                    <ArrowDown size={16} />
                  </button>
                  <button type="button" className="a-icon-btn" style={{ marginLeft: "auto" }} disabled={pending} onClick={async () => confirm("Apagar esta capa?") && (await run(() => deleteHero(h.id))).ok && router.refresh()} aria-label="Apagar capa">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="a-empty">
          <strong>Sem capas.</strong>Sem capa publicada, o site usa automaticamente a primeira viatura disponível com o nome e a frase do stand.
        </div>
      )}

      <Dialog open={edit !== null && !!draft} onClose={() => setEdit(null)} title={edit?.id ? "Editar capa" : "Nova capa"} wide>
        {draft && (
          <form
            className="a-form"
            style={{ gap: 18 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await run(() => saveHero(edit?.id || null, { ...draft, headlineAccent: draft.headlineAccent || undefined }));
              if (res.ok) {
                setEdit(null);
                router.refresh();
              }
            }}
          >
            <div className="a-fields">
              <div className="a-field wide">
                <label htmlFor="h-vehicle">Viatura</label>
                <select
                  id="h-vehicle"
                  value={draft.vehicleId}
                  onChange={(e) => {
                    const v = vehicles.find((x) => x.id === e.target.value);
                    setD({ vehicleId: e.target.value, imageDesktop: v?.photos[0] ?? "", imageMobile: v?.photos[0] ?? "" });
                  }}
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id} disabled={!v.photos.length}>
                      {v.label}
                      {v.published ? "" : " (não publicada)"}
                    </option>
                  ))}
                </select>
                {fields.vehicleId && <span className="a-error">{fields.vehicleId}</span>}
              </div>
            </div>
            {(["Desktop", "Mobile"] as const).map((kind) => {
              const key = kind === "Desktop" ? "imageDesktop" : "imageMobile";
              const [x, y] = kind === "Desktop" ? [dx, dy] : [mx, my];
              const posKey = kind === "Desktop" ? "objectPositionDesktop" : "objectPositionMobile";
              return (
                <fieldset key={kind} className="a-fieldset">
                  <legend>{kind === "Desktop" ? "Computador" : "Telemóvel"}</legend>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {photos.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setD({ [key]: p })}
                        aria-pressed={draft[key] === p}
                        aria-label="Escolher fotografia"
                        style={{ padding: 0, border: draft[key] === p ? "2px solid var(--accent)" : "2px solid transparent", borderRadius: 6, background: "none" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 4, display: "block" }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: kind === "Desktop" ? "1fr" : "240px 1fr", gap: 14, alignItems: "start" }}>
                    <Preview image={draft[key]} pos={draft[posKey]} tone={draft.textTone} eyebrow={draft.eyebrow} headline={draft.headline} accent={draft.headlineAccent} mobile={kind === "Mobile"} />
                    <div style={{ display: "grid", gap: 8 }}>
                      <label className="a-label">
                        Enquadramento horizontal: {Math.round(x)}%
                        <input type="range" min={0} max={100} value={x} onChange={(e) => setD({ [posKey]: `${e.target.value}% ${Math.round(y)}%` })} style={{ width: "100%" }} />
                      </label>
                      <label className="a-label">
                        Enquadramento vertical: {Math.round(y)}%
                        <input type="range" min={0} max={100} value={y} onChange={(e) => setD({ [posKey]: `${Math.round(x)}% ${e.target.value}%` })} style={{ width: "100%" }} />
                      </label>
                    </div>
                  </div>
                </fieldset>
              );
            })}
            <div className="a-fields">
              <div className="a-field">
                <label htmlFor="h-tone">Cor do texto</label>
                <select id="h-tone" value={draft.textTone} onChange={(e) => setD({ textTone: e.target.value as "light" | "dark" })}>
                  <option value="light">Claro (fotografia escura)</option>
                  <option value="dark">Escuro (fotografia clara)</option>
                </select>
              </div>
              <div className="a-field" style={{ gridColumn: "span 2" }}>
                <label htmlFor="h-eyebrow">Frase de abertura</label>
                <input id="h-eyebrow" value={draft.eyebrow} onChange={(e) => setD({ eyebrow: e.target.value })} maxLength={150} />
                {fields.eyebrow && <span className="a-error">{fields.eyebrow}</span>}
              </div>
              <div className="a-field">
                <label htmlFor="h-headline">Título</label>
                <input id="h-headline" value={draft.headline} onChange={(e) => setD({ headline: e.target.value })} maxLength={160} />
                {fields.headline && <span className="a-error">{fields.headline}</span>}
              </div>
              <div className="a-field">
                <label htmlFor="h-accent">Continuação do título (opcional)</label>
                <input id="h-accent" value={draft.headlineAccent} onChange={(e) => setD({ headlineAccent: e.target.value })} maxLength={160} />
              </div>
              <div className="a-field wide">
                <label htmlFor="h-desc">Descrição</label>
                <textarea id="h-desc" rows={2} value={draft.description} onChange={(e) => setD({ description: e.target.value })} maxLength={500} />
                {fields.description && <span className="a-error">{fields.description}</span>}
              </div>
            </div>
            <div className="a-actions">
              <button className="a-btn a-btn-primary" disabled={pending}>
                {pending ? <Spinner /> : <Save size={16} />} Guardar capa
              </button>
              <span className="muted" style={{ fontSize: 13 }}>
                Fica em rascunho até usar “Publicar no site”. Reveja os dois formatos: rodas, para-choques e contraste do texto.
              </span>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
