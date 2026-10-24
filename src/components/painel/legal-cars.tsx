import Link from "next/link";
import { FileText } from "lucide-react";
import { DEADLINE_PILL, deadlineText, STAGE_PILL, STAGE_SHORT } from "@/lib/legalizacao";
import type { LegalCarRow } from "@/server/legalization";

/** Linhas de carros em legalização: etapa, prazo da DAV e nº de documentos. */
export function LegalCarRows({ cars, tab }: { cars: LegalCarRow[]; tab?: string }) {
  return (
    <>
      {cars.map((c) => {
        const showDeadline = c.stage === "modelo9" || c.stage === "alfandega";
        return (
          <Link key={c.id} href={`/painel/legalizacao/${c.id}${tab ? `?etapa=${tab}` : ""}`} className="a-legal-row">
            <span style={{ minWidth: 0 }}>
              <strong>{c.title}</strong>
              <small>{c.sub}</small>
            </span>
            <span className="a-legal-pills">
              <span className={`a-pill ${STAGE_PILL[c.stage]}`}>{STAGE_SHORT[c.stage]}</span>
              {showDeadline && c.deadline.state !== "sem_data" && <span className={`a-pill ${DEADLINE_PILL[c.deadline.state]}`}>{deadlineText(c.deadline)}</span>}
              <span className="a-pill plain" title="Documentos guardados">
                <FileText size={12} /> {c.docs}
              </span>
            </span>
          </Link>
        );
      })}
    </>
  );
}
