"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Smartphone } from "lucide-react";
import { startPhoneCapture } from "@/app/painel/_actions/capture";
import { Alert, Dialog, Spinner } from "./ui";

export type CaptureTarget = { ownerType: "vehicle" | "customer" | "none" | "photos"; ownerId?: string; kind?: string };
export type RemoteFile = { id: string; name: string; mime: string };

/** No computador o "Fotografar" do navegador só abre a pasta de ficheiros: aí mostra-se esta janela. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

/**
 * Fotografar no computador: (1) com o telemóvel — código QR, as fotografias chegam sozinhas;
 * (2) com a câmara do computador.
 */
export function CaptureDialog({
  open,
  onClose,
  target,
  onRemoteFiles,
  onWebcamFile,
}: {
  open: boolean;
  onClose: () => void;
  target: CaptureTarget;
  onRemoteFiles: (files: RemoteFile[]) => void;
  onWebcamFile?: (file: File) => void;
}) {
  const [mode, setMode] = useState<"phone" | "webcam">("phone");
  const [session, setSession] = useState<{ id: string; url: string; qrSvg: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const [expired, setExpired] = useState(false);
  const seen = useRef(new Set<string>());
  const onFiles = useRef(onRemoteFiles);
  onFiles.current = onRemoteFiles;
  const targetKey = JSON.stringify(target);

  const start = useCallback(async () => {
    setError(null);
    setSession(null);
    setExpired(false);
    setReceived(0);
    seen.current = new Set();
    const res = await startPhoneCapture(JSON.parse(targetKey) as CaptureTarget).catch(() => null);
    if (res?.ok) setSession(res.data);
    else setError(res && !res.ok ? res.error : "Sem ligação ao servidor.");
  }, [targetKey]);

  useEffect(() => {
    if (open && mode === "phone" && !session && !error) void start();
  }, [open, mode, session, error, start]);
  useEffect(() => {
    if (!open) {
      setSession(null);
      setError(null);
    }
  }, [open]);

  // Vai buscando o que chegou do telemóvel.
  useEffect(() => {
    if (!open || !session || expired) return;
    let alive = true;
    const tick = async () => {
      const res = await fetch(`/api/admin/capture/${session.id}`, { cache: "no-store" }).catch(() => null);
      const json = (await res?.json().catch(() => null)) as { ok: boolean; expired: boolean; files: RemoteFile[] } | null;
      if (!alive || !json?.ok) return;
      const fresh = json.files.filter((f) => !seen.current.has(f.id));
      fresh.forEach((f) => seen.current.add(f.id));
      if (fresh.length) {
        setReceived(seen.current.size);
        onFiles.current(fresh);
      }
      if (json.expired) setExpired(true);
    };
    const t = setInterval(() => void tick(), 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, session, expired]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Fotografar"
      footer={
        <button type="button" className="a-btn a-btn-primary" onClick={onClose}>
          {received ? `Concluído (${received})` : "Fechar"}
        </button>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div className="a-tabs" role="tablist" style={{ border: 0 }}>
          <button type="button" role="tab" aria-selected={mode === "phone"} onClick={() => setMode("phone")}>
            <Smartphone size={15} /> Com o telemóvel
          </button>
          {onWebcamFile && (
            <button type="button" role="tab" aria-selected={mode === "webcam"} onClick={() => setMode("webcam")}>
              <Camera size={15} /> Câmara do computador
            </button>
          )}
        </div>
        {mode === "phone" ? (
          <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
            {error ? (
              <Alert kind="danger">{error}</Alert>
            ) : !session ? (
              <p className="muted">
                <Spinner /> A preparar o código…
              </p>
            ) : expired ? (
              <>
                <Alert kind="warn">O código expirou.</Alert>
                <button type="button" className="a-btn" onClick={() => void start()}>
                  Gerar outro código
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: 0 }}>Aponte a câmara do telemóvel para o código e tire as fotografias lá.</p>
                <div style={{ width: 220, height: 220, background: "#fff", padding: 8, borderRadius: 12, border: "1px solid var(--line)" }} dangerouslySetInnerHTML={{ __html: session.qrSvg }} />
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Válido 15 minutos, só para este ecrã. {received ? <strong style={{ color: "var(--ok)" }}>Recebidas: {received}</strong> : "À espera das fotografias…"}
                </p>
              </>
            )}
          </div>
        ) : (
          <Webcam onPhoto={(f) => onWebcamFile?.(f)} />
        )}
      </div>
    </Dialog>
  );
}

function Webcam({ onPhoto }: { onPhoto: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch(() => setError("Não foi possível abrir a câmara. Autorize o acesso no navegador ou use o telemóvel."));
    if (!navigator.mediaDevices) setError("Este navegador não dá acesso à câmara. Use o telemóvel.");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onPhoto(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setTaken((n) => n + 1);
      },
      "image/jpeg",
      0.9,
    );
  }

  if (error) return <Alert kind="warn">{error}</Alert>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 10, background: "#000", aspectRatio: "16 / 9", objectFit: "cover" }} />
      <div className="a-actions" style={{ justifyContent: "space-between" }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {taken ? `${taken} fotografia${taken === 1 ? "" : "s"} tirada${taken === 1 ? "" : "s"}.` : "Para documentos, o telemóvel dá fotos mais nítidas."}
        </span>
        <button type="button" className="a-btn a-btn-primary" onClick={snap}>
          <Camera size={16} /> Tirar fotografia
        </button>
      </div>
    </div>
  );
}
