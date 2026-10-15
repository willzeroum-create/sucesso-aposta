/** Tipos de documento (rótulos em pt-PT). Partilhável com o cliente. */
export const DOCUMENT_KINDS = {
  dua: "DUA / Certificado de matrícula",
  livrete_estrangeiro: "Certificado de matrícula estrangeiro",
  coc: "Certificado de conformidade (CoC)",
  fatura: "Fatura / declaração de compra",
  inspecao: "Inspeção periódica (IPO)",
  registo: "Registo automóvel",
  seguro: "Seguro",
  identificacao: "Documento de identificação",
  morada: "Comprovativo de morada",
  carta_conducao: "Carta de condução",
  contrato: "Contrato / termo assinado",
  modelo9: "Modelo 9 (IMT)",
  outro: "Outro documento",
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export const VEHICLE_DOCUMENT_KINDS: DocumentKind[] = ["dua", "livrete_estrangeiro", "coc", "modelo9", "fatura", "inspecao", "registo", "seguro", "contrato", "outro"];
export const CUSTOMER_DOCUMENT_KINDS: DocumentKind[] = ["identificacao", "morada", "carta_conducao", "contrato", "outro"];

/** O tipo de documento detetado pela IA → tipo de arquivo. */
export function kindFromAi(code: string): DocumentKind {
  const map: Record<string, DocumentKind> = {
    dua: "dua",
    livrete_estrangeiro: "livrete_estrangeiro",
    coc: "coc",
    fatura: "fatura",
    inspecao: "inspecao",
    registo: "registo",
    cartao_cidadao: "identificacao",
    titulo_residencia: "identificacao",
    passaporte: "identificacao",
    bilhete_identidade: "identificacao",
    carta_conducao: "carta_conducao",
    comprovativo_morada: "morada",
    certidao_permanente: "outro",
  };
  return map[code] ?? "outro";
}
