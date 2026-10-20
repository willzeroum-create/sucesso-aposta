"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "./brand-logo";
import "./brand-intro.css";

/** Duração total da entrada (a saída em CSS termina aos ~3 s). */
const DURATION_MS = 3100;

/** Apresentação da marca a cada carregamento da página; toque ou clique salta. */
export function BrandIntro({ name }: { name: string }) {
  const [phase, setPhase] = useState<"on" | "leaving" | "off">("on");

  useEffect(() => {
    const timer = window.setTimeout(() => setPhase("off"), phase === "leaving" ? 280 : DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "off") return null;
  const skip = () => setPhase("leaving");

  return (
    <div className={`brand-intro ${phase === "leaving" ? "is-leaving" : ""}`} onClick={skip}>
      <div className="brand-intro-road" aria-hidden="true">
        <span />
      </div>
      <div className="brand-intro-glow" aria-hidden="true" />
      <div className="brand-intro-stage">
        <BrandLogo variant="full" intro name={name} />
      </div>
      <button type="button" className="brand-intro-skip" onClick={skip}>
        Avançar <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
