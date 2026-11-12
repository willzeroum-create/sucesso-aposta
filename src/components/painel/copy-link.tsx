"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/** Copia o endereço público (/carros/<slug>) para enviar o carro a um cliente. */
export function CopyVehicleLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copie o link do carro:", url);
    }
  }
  return (
    <button type="button" onClick={copy} className="a-link" style={{ display: "inline-flex", gap: 4, alignItems: "center", background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}>
      {copied ? <Check size={13} /> : <Link2 size={13} />}
      {copied ? "Link copiado" : "Copiar link"}
    </button>
  );
}
