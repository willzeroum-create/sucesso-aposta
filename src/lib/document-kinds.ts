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
  modelo9_assinado: "Modelo 9 assinado (homologação e inspeção)",
  homologacao: "Homologação (IMT)",
  inspecao_b: "Inspeção tipo B (Modelo 112)",
  exportacao: "Documento de exportação",
  transporte: "CMR / seguro de transporte",
  dav: "DAV (Declaração Aduaneira de Veículo)",
  isv: "Pagamento do ISV (DUC)",
  outro: "Outro documento",
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export const VEHICLE_DOCUMENT_KINDS: DocumentKind[] = ["dua", "livrete_estrangeiro", "coc", "modelo9", "fatura", "inspecao", "registo", "seguro", "contrato", "outro"];
export const CUSTOMER_DOCUMENT_KINDS: DocumentKind[] = ["identificacao", "morada", "carta_conducao", "contrato", "outro"];
/** Carro em legalização: documentos do cliente e do carro, e os que o escritório trata (Modelo 9, DAV, registo). */
export const LEGALIZATION_DOCUMENT_KINDS: DocumentKind[] = [
  "livrete_estrangeiro", "coc", "fatura", "identificacao", "exportacao", "transporte", "modelo9", "modelo9_assinado", "homologacao", "inspecao_b", "dav", "isv", "registo", "dua", "outro",
];

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
    cmr: "transporte",
    transporte: "transporte",
    exportacao: "exportacao",
    dav: "dav",
    duc: "isv",
    registo_inicial: "registo",
    conservatoria: "registo",
    solicitador: "registo",
  };
  return map[code] ?? "outro";
}
