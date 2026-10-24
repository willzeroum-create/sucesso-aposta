import Link from "next/link";
import { Check } from "lucide-react";
import { deadlineText, STAGE_LABEL, type DavDeadline, type Stage } from "@/lib/legalizacao";
import { VEHICLE_STATUS, type VehicleStatusKey } from "@/lib/labels";
import type { SectionKey } from "@/lib/sections";
import { StartLegalization } from "./start-legalization";

type StepState = "done" | "now" | "todo";

/**
 * Percurso do carro: Entrada (fotos do carro e dos documentos) → Preparação (lavagem, dados) →
 * Legalização (se for importado: Modelo 9 → Alfândega → Registo inicial) → Destino (Venda no site, Aluguer ou Só estoque).
 */
export function CarJourney({
  vehicleId,
  base,
  photos,
  docs,
  status,
  section,
  published,
  gaps,
  rented,
  ptPlate,
  legalization,
  canLegalize,
}: {
  vehicleId: string;
  base: string;
  photos: number;
  docs: number;
  status: VehicleStatusKey;
  section: SectionKey;
  published: boolean;
  gaps: string[];
  rented: boolean;
  ptPlate: boolean;
  legalization: { id: string; stage: Stage; deadline: DavDeadline; ptPlate: string } | null;
  canLegalize: boolean;
}) {
  const entry: StepState = photos && docs ? "done" : "now";
  const prep: StepState = status !== "preparation" ? "done" : entry === "done" ? "now" : "todo";
  const legal: StepState = legalization ? (legalization.stage === "concluido" ? "done" : "now") : ptPlate ? "done" : "todo";
  const sold = status === "sold";
  const destDone = sold || (section === "site" ? published && status !== "preparation" : status !== "preparation");
  const dest: StepState = destDone ? "done" : prep === "done" ? "now" : "todo";

  const destText = sold
    ? { title: "Vendido", note: "Negócio fechado." }
    : section === "site"
      ? published && status !== "preparation"
        ? { title: "Venda — no site", note: status === "reserved" ? "Reservado." : "Publicado e visível." }
        : { title: "Venda — ainda fora do site", note: gaps.length ? `Falta: ${gaps.join(", ")}.` : "Pronto: passe a Disponível e publique." }
      : section === "aluguer"
        ? { title: "Aluguer", note: rented ? "Alugado agora." : status === "preparation" ? "Em preparação." : "Pronto para alugar." }
        : { title: "Só estoque", note: "Fica na casa, não vai para o site." };

  const steps = [
    {
      key: "entrada",
      label: "1 · Entrada",
      state: entry,
      title: "Fotos e documentos",
      note: `${photos} fotografia${photos === 1 ? "" : "s"} · ${docs} documento${docs === 1 ? "" : "s"}`,
      href: photos ? `${base}?tab=documentos` : `${base}?tab=fotos`,
    },
    {
      key: "preparacao",
      label: "2 · Preparação",
      state: prep,
      title: status === "preparation" ? "Em preparação" : "Preparado",
      note: status === "preparation" ? "Lavagem, fotografias e dados do carro." : VEHICLE_STATUS[status].label,
      href: `${base}?tab=dados`,
    },
    {
      key: "legalizacao",
      label: "3 · Legalização",
      state: legal,
      title: legalization ? STAGE_LABEL[legalization.stage] : ptPlate ? "Matrícula portuguesa" : "Carro importado?",
      note: legalization
        ? legalization.stage === "concluido"
          ? `Concluída${legalization.ptPlate ? ` · ${legalization.ptPlate}` : ""}.`
          : legalization.stage === "registo"
            ? legalization.ptPlate
              ? `Matrícula ${legalization.ptPlate}; falta o registo.`
              : "Entregar no IMT."
            : deadlineText(legalization.deadline)
        : ptPlate
          ? "Já tem matrícula portuguesa. Se for importado, comece aqui."
          : "Modelo 9 → Alfândega → Registo inicial.",
      href: legalization ? `/painel/legalizacao/${legalization.id}` : null,
    },
    { key: "destino", label: "4 · Destino", state: dest, title: destText.title, note: destText.note, href: section === "aluguer" ? `${base}?tab=aluguer` : `${base}?tab=venda` },
  ];

  return (
    <nav className="a-journey" aria-label="Percurso do carro">
      {steps.map((s) => {
        const body = (
          <>
            <b>
              {s.state === "done" && <Check size={13} />} {s.label}
            </b>
            <strong>{s.title}</strong>
            <small>{s.note}</small>
            {s.key === "legalizacao" && !legalization && canLegalize && (
              <span style={{ marginTop: 4 }}>
                <StartLegalization vehicleId={vehicleId} />
              </span>
            )}
          </>
        );
        return s.href ? (
          <Link key={s.key} href={s.href} className="a-journey-step" data-state={s.state} scroll={false}>
            {body}
          </Link>
        ) : (
          <div key={s.key} className="a-journey-step" data-state={s.state}>
            {body}
          </div>
        );
      })}
    </nav>
  );
}
