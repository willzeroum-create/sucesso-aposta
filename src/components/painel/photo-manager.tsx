"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus, Smartphone, Star, Trash2 } from "lucide-react";
import { deletePhoto, reorderPhotos, setCoverPhoto, updatePhotoAlt } from "@/app/painel/_actions/vehicles";
import { uploadPhotos } from "./upload";
import { CaptureDialog, useIsDesktop } from "./capture-dialog";
import { Spinner, useAction, useToast } from "./ui";

type Photo = { id: string; url: string; alt: string };

export function PhotoManager({ vehicleId, photos: initial, coverId, canEdit }: { vehicleId: string; photos: Photo[]; coverId: string | null; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useAction();
  const [photos, setPhotos] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const desktop = useIsDesktop();
  const [capturing, setCapturing] = useState(false);
  useEffect(() => setPhotos(initial), [initial]);

  async function upload(list: FileList | File[] | null) {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!files.length) return;
    setProgress({ done: 0, total: files.length });
    try {
      const n = await uploadPhotos(vehicleId, files, (done, total) => setProgress({ done, total }));
      toast("ok", `${n} fotografia(s) adicionada(s).`);
    } catch (e) {
      toast("danger", e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  }

  async function persist(order: Photo[]) {
    setPhotos(order);
    await run(() => reorderPhotos(vehicleId, order.map((p) => p.id)), { quiet: true });
    router.refresh();
  }

  function move(id: string, delta: number) {
    const i = photos.findIndex((p) => p.id === id);
    const j = i + delta;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    void persist(next);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {canEdit && desktop && (
        <div className="a-actions">
          <button type="button" className="a-btn a-btn-sm" onClick={() => setCapturing(true)}>
            <Smartphone size={15} /> Fotografar com o telemóvel
          </button>
          <CaptureDialog
            open={capturing}
            onClose={() => setCapturing(false)}
            target={{ ownerType: "photos", ownerId: vehicleId }}
            onRemoteFiles={(files) => {
              toast("ok", `${files.length} fotografia(s) recebida(s) do telemóvel.`);
              router.refresh();
            }}
            onWebcamFile={(f) => void upload([f])}
          />
        </div>
      )}
      {canEdit && (
        <div
          className="a-drop"
          data-active={dropActive}
          role="button"
          tabIndex={0}
          onClick={() => input.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setDropActive(true);
            }
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDropActive(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          <ImagePlus size={24} aria-hidden="true" />
          {progress ? (
            <div style={{ width: "min(320px, 80%)", display: "grid", gap: 6 }} aria-live="polite">
              <span>
                A enviar {progress.done} de {progress.total}…
              </span>
              <div className="a-progress">
                <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <strong>Toque para fotografar ou escolher fotografias</strong>
              <span style={{ fontSize: 13 }}>No computador, também pode arrastá-las para aqui.</span>
              <span style={{ fontSize: 13 }}>JPG, PNG ou WebP. São otimizadas e os dados de localização (GPS) são removidos.</span>
            </>
          )}
        </div>
      )}

      {photos.length ? (
        <>
          {canEdit && photos.length > 1 && <p className="muted" style={{ fontSize: 13 }}>Arraste para reordenar. A primeira com estrela é a capa no site.</p>}
          <ul className="a-gallery" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {photos.map((p, i) => (
              <li
                key={p.id}
                className="a-photo"
                draggable={canEdit}
                data-dragging={drag === p.id}
                data-over={over === p.id && drag !== p.id}
                onDragStart={(e) => {
                  setDrag(p.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setOver(p.id);
                }}
                onDragEnd={() => (setDrag(null), setOver(null))}
                onDrop={(e) => {
                  if (!drag || drag === p.id) return;
                  e.preventDefault();
                  const from = photos.findIndex((x) => x.id === drag);
                  const to = photos.findIndex((x) => x.id === p.id);
                  const next = [...photos];
                  const [moved] = next.splice(from, 1);
                  next.splice(to, 0, moved);
                  setDrag(null);
                  setOver(null);
                  void persist(next);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt} loading="lazy" draggable={false} />
                {p.id === coverId && <span className="a-pill accent plain a-cover-flag">Capa</span>}
                {canEdit && (
                  <>
                    <input
                      className="a-input"
                      defaultValue={p.alt}
                      aria-label={`Descrição da fotografia ${i + 1}`}
                      placeholder="Descrição (acessibilidade)"
                      style={{ minHeight: 32, fontSize: 13, padding: "4px 8px" }}
                      onBlur={(e) => e.target.value !== p.alt && run(() => updatePhotoAlt(vehicleId, p.id, e.target.value), { quiet: true })}
                    />
                    <div className="a-photo-bar">
                      <button type="button" className="a-icon-btn" onClick={() => move(p.id, -1)} disabled={i === 0 || pending} aria-label="Mover para a esquerda">
                        <ArrowLeft size={15} />
                      </button>
                      <button type="button" className="a-icon-btn" onClick={() => move(p.id, 1)} disabled={i === photos.length - 1 || pending} aria-label="Mover para a direita">
                        <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className="a-icon-btn"
                        onClick={async () => (await run(() => setCoverPhoto(vehicleId, p.id))).ok && router.refresh()}
                        disabled={p.id === coverId || pending}
                        aria-label="Usar como capa"
                        title="Usar como capa"
                      >
                        <Star size={15} fill={p.id === coverId ? "currentColor" : "none"} />
                      </button>
                      <button
                        type="button"
                        className="a-icon-btn"
                        style={{ marginLeft: "auto" }}
                        onClick={async () => {
                          if (!confirm("Apagar esta fotografia?")) return;
                          if ((await run(() => deletePhoto(vehicleId, p.id))).ok) router.refresh();
                        }}
                        disabled={pending}
                        aria-label="Apagar fotografia"
                      >
                        {pending ? <Spinner size={14} /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="a-empty">
          <strong>Sem fotografias.</strong>É preciso pelo menos uma para publicar no site.
        </div>
      )}
    </div>
  );
}
