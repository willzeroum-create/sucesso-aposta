"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { isPortuguesePlate, formatPlate } from "@/lib/pt-validation";
import { VEHICLE_STATUS, type VehicleStatusKey } from "@/lib/labels";

export function Plate({ value, large = false }: { value: string | null | undefined; large?: boolean }) {
  if (!value) return <span className={`a-plate none${large ? " lg" : ""}`}><span>Sem matrícula</span></span>;
  const pt = isPortuguesePlate(value);
  return (
    <span className={`a-plate${pt ? "" : " foreign"}${large ? " lg" : ""}`} aria-label={`Matrícula ${value}`}>
      <span>{pt ? formatPlate(value) : value}</span>
    </span>
  );
}

export function StatusPill({ status }: { status: VehicleStatusKey }) {
  return <span className={`a-pill ${status}`}>{VEHICLE_STATUS[status].label}</span>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="a-spin" aria-hidden="true" />;
}

export function Alert({ kind = "info", title, children }: { kind?: "info" | "ok" | "warn" | "danger"; title?: string; children?: ReactNode }) {
  const Icon = kind === "ok" ? CheckCircle2 : kind === "info" ? Info : AlertTriangle;
  return (
    <div className={`a-alert a-alert-${kind}`} role={kind === "danger" ? "alert" : "status"}>
      <Icon size={18} aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        {children && <div style={{ color: "var(--ink)" }}>{children}</div>}
      </div>
    </div>
  );
}

/* ── Avisos temporários ── */

type Toast = { id: number; kind: "ok" | "danger" | "info"; text: string };
const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((kind: Toast["kind"], text: string) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), kind, text });
    timer.current = setTimeout(() => setToast(null), kind === "danger" ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" aria-atomic="true">
        {toast && (
          <div className={`a-alert a-alert-${toast.kind} a-toast`} key={toast.id}>
            {toast.kind === "ok" ? <CheckCircle2 size={18} /> : toast.kind === "danger" ? <AlertTriangle size={18} /> : <Info size={18} />}
            <p style={{ flex: 1 }}>{toast.text}</p>
            <button type="button" className="a-icon-btn" style={{ width: 24, height: 24 }} onClick={() => setToast(null)} aria-label="Fechar aviso">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Executa uma Server Action com estado de carregamento e aviso automático. */
export function useAction() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const runAction = useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, opts: { quiet?: boolean } = {}): Promise<ActionResult<T>> => {
      setPending(true);
      try {
        const res = await fn();
        if (res.ok) {
          setFields({});
          if (res.message && !opts.quiet) toast("ok", res.message);
        } else {
          setFields(res.fields ?? {});
          toast("danger", res.error);
        }
        return res;
      } catch {
        toast("danger", "Sem ligação ao servidor. Verifique a internet e tente de novo.");
        return { ok: false, error: "Sem ligação." };
      } finally {
        setPending(false);
      }
    },
    [toast],
  );
  return { pending, fields, setFields, run: runAction };
}

/* ── Diálogo nativo ── */

export function Dialog({ open, onClose, title, children, footer, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`a-dialog${wide ? " wide" : ""}`} onClose={onClose} onCancel={onClose} aria-label={title}>
      {open && (
        <>
          <div className="a-dialog-head">
            <h2>{title}</h2>
            <button type="button" className="a-icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          <div className="a-dialog-body">{children}</div>
          {footer && <div className="a-dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  wide,
  suggested,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  wide?: boolean;
  suggested?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`a-field${wide ? " wide" : ""}${suggested ? " is-suggested" : ""}`}>
      <label htmlFor={`f-${name}`}>{label}</label>
      {children}
      {error ? (
        <span className="a-error" id={`f-${name}-error`}>
          {error}
        </span>
      ) : hint ? (
        <span className="a-hint">{hint}</span>
      ) : null}
    </div>
  );
}
