import { useId, type CSSProperties } from "react";
import { EMBLEM_SIZE, EMBLEM_VIEWBOX, HEADLIGHTS, ROAD_AXIS, emblemOutlines } from "./brand-paths";
import "./brand-logo.css";

type BrandLogoProps = {
  /** full: símbolo + nome + frase · compact: símbolo e nome em duas linhas ao lado · emblem: só o "SP". */
  variant?: "full" | "emblem" | "compact";
  /** Versão para fundo escuro (preto passa a creme, vermelho mantém-se). */
  dark?: boolean;
  /** Movimento contínuo: luz a correr na estrada, faróis a pulsar e reflexo. */
  animated?: boolean;
  /** Construção do logo (contornos a desenhar-se, preenchimento, faróis, nome). */
  intro?: boolean;
  name?: string;
  className?: string;
};

/** Ordem e atraso (s) do desenho de cada contorno na entrada: S, P, estrada e por fim o carro. */
const DRAW: Record<string, { delay: number; red?: boolean }> = {
  s: { delay: 0 },
  ptop: { delay: 0.1, red: true },
  p: { delay: 0.16, red: true },
  stripe: { delay: 0.26, red: true },
  road: { delay: 0.32 },
  roof: { delay: 0.46 },
  body: { delay: 0.54 },
  spoiler: { delay: 0.64 },
  light: { delay: 0.74, red: true },
};

/** Eixo do risco vermelho ao lado da estrada (segunda luz, mais rápida). */
const STRIPE_AXIS = "M560 190 L300 352 L20 516";
const road = emblemOutlines.find((outline) => outline.part === "road")!.d;
const stripe = emblemOutlines.find((outline) => outline.part === "stripe")!.d;

/** Medidas das imagens do nome (public/brand). */
const NAME_FULL = { width: 1418, height: 206 };
const NAME_STACKED = { width: 756, height: 219 };

/**
 * Logo "Sucesso Promissor": a imagem é o desenho original (fiel à marca);
 * por cima, uma camada SVG com os contornos traçados e os efeitos de luz.
 */
export function BrandLogo({
  variant = "full",
  dark = false,
  animated = false,
  intro = false,
  name = "Sucesso Promissor",
  className = "",
}: BrandLogoProps) {
  const id = useId().replace(/[^\w-]/g, "");
  const tone = dark ? "-dark" : "";
  const size = variant === "compact" ? "-520" : "";
  const emblem = `/brand/logo-emblem${tone}${size}.webp`;
  const nameSrc = variant === "full" ? `/brand/logo-wordmark${tone}.webp` : `/brand/logo-name${tone}${size}.webp`;
  const nameSize = variant === "full" ? NAME_FULL : NAME_STACKED;
  const mask = (src: string): CSSProperties => ({ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` });
  const eager = intro ? ({ loading: "eager", fetchPriority: "high" } as const) : {};
  const classes = [
    "brand-logo",
    `brand-logo--${variant}`,
    dark && "brand-logo--dark",
    animated && "brand-logo--alive",
    intro && "brand-logo--intro",
    className,
  ];

  return (
    <span className={classes.filter(Boolean).join(" ")} role="img" aria-label={name}>
      <span className="brand-emblem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={emblem} alt="" {...EMBLEM_SIZE} decoding="async" draggable={false} {...eager} />
        {intro && (
          <svg className="brand-draw" viewBox={EMBLEM_VIEWBOX} aria-hidden="true" focusable="false">
            {emblemOutlines.map((outline, index) => {
              const step = DRAW[outline.part] ?? { delay: 0.6 };
              return (
                <path
                  key={index}
                  className={step.red ? "is-red" : undefined}
                  d={outline.d}
                  pathLength={1}
                  style={{ "--d": `${step.delay}s` } as CSSProperties}
                />
              );
            })}
          </svg>
        )}
        {(animated || intro) && (
          <svg className="brand-fx" viewBox={EMBLEM_VIEWBOX} aria-hidden="true" focusable="false">
            <defs>
              <clipPath id={`${id}-road`}>
                <path d={road} />
              </clipPath>
              <clipPath id={`${id}-stripe`}>
                <path d={stripe} />
              </clipPath>
              <radialGradient id={`${id}-glow`}>
                <stop offset="0" stopColor="#ff3a24" stopOpacity="1" />
                <stop offset=".42" stopColor="#e3140f" stopOpacity=".5" />
                <stop offset="1" stopColor="#c4120f" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={`${id}-flare`}>
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset=".5" stopColor="#fff" stopOpacity="1" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>
            <g clipPath={`url(#${id}-road)`}>
              <path className="brand-streak brand-streak--glow" d={ROAD_AXIS} pathLength={1} filter={`url(#${id}-blur)`} />
              <path className="brand-streak" d={ROAD_AXIS} pathLength={1} />
            </g>
            <g clipPath={`url(#${id}-stripe)`}>
              <path className="brand-streak brand-streak--stripe" d={STRIPE_AXIS} pathLength={1} filter={`url(#${id}-blur)`} />
            </g>
            {HEADLIGHTS.map((light, index) => (
              <g key={index} className="brand-light">
                <ellipse className="brand-glow" {...light} fill={`url(#${id}-glow)`} />
                <ellipse
                  className="brand-flare"
                  cx={light.cx}
                  cy={light.cy}
                  rx={light.rx * 1.9}
                  ry={3.2}
                  fill={`url(#${id}-flare)`}
                />
              </g>
            ))}
          </svg>
        )}
        {(animated || intro) && <span className="brand-sheen" style={mask(emblem)} aria-hidden="true" />}
      </span>
      {variant !== "emblem" && (
        <span className="brand-name">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={nameSrc} alt="" {...nameSize} decoding="async" draggable={false} {...eager} />
          {(animated || intro) && <span className="brand-sheen" style={mask(nameSrc)} aria-hidden="true" />}
        </span>
      )}
    </span>
  );
}
