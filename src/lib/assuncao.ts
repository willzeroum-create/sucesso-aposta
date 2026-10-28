/**
 * Contrato de assunção de responsabilidade, garantia e direito de regresso (minuta do advogado, 28/10/2026).
 * Gerado a partir de uma venda a prestações (Cobranças): o Primeiro Outorgante recebe, o Segundo paga as
 * prestações. Com entidade financiadora (ex.: Bi-Credit) o texto é o da minuta; sem ela, as cláusulas 1 a 3
 * falam do valor em dívida financiado pelo próprio stand.
 */

export const ASSUNCAO_TEMPLATE = "contrato_assuncao";
export const ASSUNCAO_TITLE = "Contrato de assunção de responsabilidade";

export interface Outorgante {
  /** Empresa: "NIPC", "com sede em", "representado por"; particular: "NIF", "residente em". */
  empresa: boolean;
  nome: string;
  nif: string;
  morada: string;
  representante: string;
  representanteNif: string;
}

export interface AssuncaoInput {
  primeiro: Outorgante;
  segundo: Outorgante;
  viatura: string;
  matricula: string;
  /** Vazio = o próprio stand financia. */
  entidade: string;
  prestacao: number | null;
  numPrestacoes: number | null;
  divida: number | null;
  primeiraData: string;
  iuc: number | null;
  penal: number | null;
  avalista: string;
  avalistaNif: string;
  local: string;
  data: string;
}

export type AssuncaoBlock =
  | { kind: "title"; text: string }
  | { kind: "text"; text: string; bold?: boolean; gap?: boolean }
  | { kind: "clause"; number: number; title: string }
  | { kind: "item"; label: string; text: string }
  | { kind: "signatures"; labels: string[] };

const eur = (v: number) => `${new Intl.NumberFormat("pt-PT", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v)} €`;
const BLANK = "________________";
const or = (v: string) => v.trim() || BLANK;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dateLong = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}` : "";
};
const dateShort = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

function party(o: Outorgante): string {
  if (o.empresa) {
    const rep = `representado por ${or(o.representante)}${o.representanteNif.trim() ? `, NIF ${o.representanteNif.trim()}` : ""}`;
    return `${or(o.nome)}, NIPC ${or(o.nif)}, com sede em ${or(o.morada)}, ${rep}`;
  }
  return `${or(o.nome)}, NIF ${or(o.nif)}, residente em ${or(o.morada)}`;
}

/** O texto completo do contrato, já com os dados (o Word e a pré-visualização usam isto). */
export function assuncaoBlocks(d: AssuncaoInput): AssuncaoBlock[] {
  const bank = d.entidade.trim();
  const viatura = or(d.viatura);
  const matricula = or(d.matricula);
  const avalista = d.avalista.trim();
  const avalistaId = avalista ? `${avalista}${d.avalistaNif.trim() ? `, NIF ${d.avalistaNif.trim()},` : ""}` : "";
  const prestacao = d.prestacao ? eur(d.prestacao) : BLANK;
  const out: AssuncaoBlock[] = [];
  const clause = (number: number, title: string, items: string[], plain = false) => {
    out.push({ kind: "clause", number, title });
    if (plain) items.forEach((text) => out.push({ kind: "text", text }));
    else items.forEach((text, i) => out.push({ kind: "item", label: `${i + 1}.`, text }));
  };

  out.push({ kind: "title", text: "CONTRATO DE ASSUNÇÃO DE RESPONSABILIDADE, GARANTIA E DIREITO DE REGRESSO" });
  out.push({ kind: "title", text: `RELATIVO À VIATURA ${viatura.toUpperCase()}` });
  out.push({ kind: "title", text: `MATRÍCULA ${matricula.toUpperCase()}` });
  out.push({ kind: "text", text: "Entre", gap: true });
  out.push({ kind: "text", text: "PRIMEIRO OUTORGANTE", gap: true });
  out.push({ kind: "text", text: party(d.primeiro) });
  out.push({ kind: "text", text: "E", gap: true });
  out.push({ kind: "text", text: "SEGUNDO OUTORGANTE", gap: true });
  out.push({ kind: "text", text: party(d.segundo) });
  out.push({ kind: "text", text: "É celebrado o presente contrato, que se rege pelas cláusulas seguintes:", gap: true });

  if (bank) {
    clause(1, "Objeto", [
      `O presente contrato regula a assunção interna de responsabilidade pelo pagamento do financiamento da viatura ${viatura}, matrícula ${matricula}, celebrado junto da ${bank}.`,
      "O presente acordo não constitui cessão da posição contratual perante a entidade financiadora.",
    ]);
    clause(2, "Inexistência de Cessão e Responsabilidade Externa", [
      `O Primeiro Outorgante mantém-se como único responsável perante a ${bank}.`,
      "O Segundo Outorgante assume obrigação autónoma de regresso integral relativamente a todos os valores pagos ou exigíveis ao abrigo do contrato de financiamento.",
    ]);
  } else {
    const plan = d.divida
      ? `O valor em dívida é de ${eur(d.divida)}, a pagar em ${d.numPrestacoes ? `${d.numPrestacoes} prestações mensais` : "prestações mensais"}.`
      : null;
    clause(1, "Objeto", [
      `O presente contrato regula a assunção de responsabilidade pelo pagamento, em prestações, do valor em dívida relativo à viatura ${viatura}, matrícula ${matricula}, financiado diretamente pelo Primeiro Outorgante.`,
      ...(plan ? [plan] : []),
    ]);
    clause(2, "Responsabilidade e Direito de Regresso", [
      "O Segundo Outorgante é o único responsável pelo pagamento do valor em dívida perante o Primeiro Outorgante.",
      "O Segundo Outorgante assume obrigação autónoma de regresso integral relativamente a todos os valores pagos ou exigíveis ao abrigo do presente contrato.",
    ]);
  }
  clause(3, "Assunção de Pagamentos", [
    bank
      ? `O Segundo Outorgante obriga-se a pagar integralmente todas as prestações mensais, atualmente no valor de ${prestacao}, até liquidação total do financiamento.`
      : `O Segundo Outorgante obriga-se a pagar integralmente todas as prestações mensais, no valor de ${prestacao}${d.primeiraData ? `, a primeira com vencimento em ${dateShort(d.primeiraData)}` : ""}, até liquidação total do valor em dívida.`,
    "O pagamento deverá ser efetuado antes do respetivo vencimento contratual.",
    "O comprovativo de pagamento deverá ser enviado ao Primeiro Outorgante no prazo máximo de 5 dias.",
  ]);
  clause(4, "Imposto Único de Circulação", [
    d.iuc
      ? `O Segundo Outorgante assume o pagamento integral do IUC, atualmente no valor base de ${eur(d.iuc)}, sujeito a atualização legal.`
      : "O Segundo Outorgante assume o pagamento integral do IUC, sujeito a atualização legal.",
    "O comprovativo deverá ser remetido no prazo máximo de 5 dias após pagamento.",
  ]);
  clause(5, "Seguro", [
    "O Segundo Outorgante obriga-se a manter seguro automóvel válido e eficaz durante todo o período de vigência do presente contrato.",
    "A ausência de seguro constitui incumprimento grave por exposição direta do Primeiro Outorgante a risco patrimonial.",
  ]);
  clause(6, "Proibição de Alienação ou Oneração", [
    "É expressamente proibida a venda, promessa de venda, cedência, oneração, penhora voluntária ou qualquer ato de disposição da viatura sem consentimento escrito do Primeiro Outorgante.",
    "A violação desta cláusula constitui incumprimento grave e imediato.",
  ]);
  clause(
    7,
    "Comunicação de Incidentes",
    ["Qualquer sinistro, apreensão, penhora, dano estrutural ou facto suscetível de afetar o valor ou disponibilidade da viatura deverá ser comunicado no prazo máximo de 48 horas."],
    true,
  );
  out.push({ kind: "clause", number: 8, title: "Incumprimento" });
  out.push({ kind: "text", text: "Constitui incumprimento:" });
  [
    "Falta de pagamento de qualquer prestação",
    "Falta de pagamento do IUC",
    "Falta de seguro válido",
    "Violação da proibição de alienação",
    "Omissão reiterada de envio de comprovativos",
  ].forEach((t, i) => out.push({ kind: "text", text: `${"abcde"[i]}) ${t}` }));
  out.push({ kind: "text", text: "Verificado incumprimento, o Segundo Outorgante dispõe de 5 dias para regularização após notificação escrita.", gap: true });
  clause(
    9,
    "Perda do Benefício do Prazo",
    ["Nos termos do artigo 781.º do Código Civil, o incumprimento determina a perda do benefício do prazo, considerando-se automaticamente vencidas todas as prestações vincendas."],
    true,
  );
  clause(10, "Cláusula Penal", [
    `Em caso de incumprimento é devida cláusula penal no valor de ${d.penal ? eur(d.penal) : BLANK} por cada mês de atraso.`,
    "As partes declaram que o montante fixado é proporcional aos danos previsíveis, nos termos do artigo 812.º do Código Civil.",
    "A cláusula penal não prejudica o direito à indemnização suplementar por danos superiores comprovados.",
  ]);
  clause(11, "Resolução", ["O incumprimento não sanado no prazo previsto determina a resolução automática do contrato."], true);
  clause(12, "Direito de Retoma da Posse", [
    "Em caso de resolução, o Segundo Outorgante autoriza expressamente o Primeiro Outorgante a retomar a posse da viatura.",
    "Tal retoma não constitui exercício arbitrário de direito.",
    "Não haverá lugar à devolução de valores pagos, sem prejuízo da compensação relativa a desgaste, utilização e desvalorização anormal.",
  ]);
  clause(
    13,
    "Responsabilidade por Danos e Encargos",
    ["O Segundo Outorgante responde integralmente por multas, portagens, coimas, encargos administrativos, danos mecânicos, estruturais ou desvalorização anormal ocorridos durante o período de posse."],
    true,
  );
  clause(14, "Confissão de Dívida", [
    "O Segundo Outorgante reconhece expressamente que as obrigações assumidas constituem dívida certa, líquida e exigível.",
    "Declara que a dívida será determinável por simples cálculo aritmético.",
  ]);
  clause(
    15,
    "Título Executivo",
    ["Nos termos do artigo 703.º do Código de Processo Civil, o presente contrato, após autenticação presencial das assinaturas, constitui título executivo quanto às obrigações pecuniárias aqui previstas."],
    true,
  );
  clause(16, "Garantia Cambiária", [
    "Para garantia do cumprimento integral das obrigações, o Segundo Outorgante entrega livrança em branco devidamente assinada.",
    ...(avalista ? [`${avalistaId} intervém como avalista pessoal e solidário, responsabilizando-se nos termos do regime cambiário aplicável.`] : []),
  ]);
  out.push({ kind: "clause", number: 17, title: "Pacto de Preenchimento" });
  out.push({ kind: "text", text: "A livrança será preenchida em caso de incumprimento pelo valor correspondente a:" });
  ["Prestações vencidas e vincendas", "IUC", "Cláusula penal", "Juros legais", "Custas judiciais", "Danos comprovados"].forEach((text) => out.push({ kind: "text", text }));
  clause(
    18,
    "Foro",
    [`É competente o foro da comarca da ${d.primeiro.empresa ? "sede" : "residência"} do Primeiro Outorgante, com renúncia a qualquer outro.`],
    true,
  );

  const signers = ["O Primeiro Outorgante", "O Segundo Outorgante", ...(avalista ? ["O Avalista"] : [])];
  const date = [d.local.trim(), dateLong(d.data)].filter(Boolean).join(", ");
  out.push({ kind: "text", text: `Data: ${date || BLANK}`, gap: true });
  out.push({ kind: "text", text: "Assinaturas presencialmente reconhecidas", gap: true });
  out.push({ kind: "signatures", labels: signers });

  out.push({ kind: "text", text: "PACTO DE PREENCHIMENTO DE LIVRANÇA", bold: true, gap: true });
  out.push({ kind: "text", text: "Entre as mesmas partes:", gap: true });
  [
    "A livrança entregue garante o cumprimento integral do contrato supra.",
    "Em caso de incumprimento definitivo, o Primeiro Outorgante fica autorizado a preenchê-la pelo valor total das obrigações vencidas e vincendas, juros, cláusula penal e despesas.",
    "A livrança será pagável à vista.",
    ...(avalista ? [`O avalista ${avalista.toUpperCase()} assume responsabilidade solidária e autónoma.`] : []),
  ].forEach((text, i) => out.push({ kind: "item", label: `${i + 1}.`, text }));
  out.push({ kind: "text", text: "Assinaturas reconhecidas presencialmente.", gap: true });
  out.push({ kind: "signatures", labels: signers });
  return out;
}

/** Valores guardados com o documento gerado (histórico e "quem"). */
export function assuncaoValues(d: AssuncaoInput, chargeId: string): Record<string, string> {
  return {
    "cobranca.id": chargeId,
    "cliente.nome": d.segundo.nome,
    "viatura.marca": d.viatura,
    "viatura.matricula": d.matricula,
    "assuncao.primeiro": d.primeiro.nome,
    "assuncao.segundo": d.segundo.nome,
    "assuncao.entidade": d.entidade,
    "assuncao.prestacao": d.prestacao != null ? String(d.prestacao) : "",
    "assuncao.avalista": d.avalista,
  };
}
