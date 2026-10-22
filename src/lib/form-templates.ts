/**
 * Documentos gerados pelo painel (partilháveis com o cliente para pré-visualização).
 *
 * Venda  → Termo de garantia + Declaração de circulação (+ Contrato de consignação, quando o cliente deixa
 *          o carro dele no stand para vender) (emitente: empresa de vendas).
 * Aluguer → Contrato de locação (emitente: empresa de aluguer).
 *
 * Estes quatro vêm em Word (src/server/templates/*.docx), recriados a partir dos documentos reais do stand,
 * com o mesmo texto e disposição; só mudam os campos {{...}}. O stand pode substituir cada um pelo seu
 * .docx final (com logótipo) em Configurações → Modelos de documentos. Os restantes são texto em PDF.
 */

export type TemplateId =
  | "termo_garantia"
  | "declaracao_circulacao"
  | "contrato_consignacao"
  | "contrato_locacao"
  | "declaracao_compra"
  | "ficha_cliente"
  | "dados_registo";

export type DealMode = "sale" | "rent";

export interface FormTemplate {
  id: TemplateId;
  title: string;
  description: string;
  needsCustomer: boolean;
  needsVehicle: boolean;
  /** Em que operação o documento é gerado (decide a empresa emitente). */
  mode: DealMode | "any";
  /** Parágrafos separados por linha em branco (só para os documentos em PDF). */
  body: string;
  /** Quadro de dados impresso depois do texto (PDF). */
  table: { label: string; value: string }[][];
  signatures: string[];
}

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "empresa.nome", label: "Nome legal da empresa" },
  { key: "empresa.nipc", label: "NIPC / NIF da empresa" },
  { key: "empresa.morada", label: "Morada completa da empresa" },
  { key: "empresa.morada_rua", label: "Rua da empresa" },
  { key: "empresa.codigo_postal", label: "Código postal da empresa" },
  { key: "empresa.localidade", label: "Localidade da empresa" },
  { key: "empresa.telefone", label: "Telefone da empresa" },
  { key: "empresa.email", label: "E-mail da empresa" },
  { key: "empresa.instagram", label: "Instagram da empresa" },
  { key: "empresa.representante", label: "Representante" },
  { key: "empresa.cargo", label: "Cargo do representante" },
  { key: "cliente.nome", label: "Nome do cliente" },
  { key: "cliente.nif", label: "NIF do cliente" },
  { key: "cliente.documento", label: "Tipo e nº do documento" },
  { key: "cliente.numero_documento", label: "Nº do documento de identificação" },
  { key: "cliente.validade_documento", label: "Validade do documento" },
  { key: "cliente.morada", label: "Morada completa do cliente" },
  { key: "cliente.morada_rua", label: "Rua do cliente" },
  { key: "cliente.codigo_postal", label: "Código postal do cliente" },
  { key: "cliente.localidade", label: "Localidade do cliente" },
  { key: "cliente.telefone", label: "Telefone do cliente" },
  { key: "cliente.email", label: "E-mail do cliente" },
  { key: "cliente.carta", label: "Nº da carta de condução" },
  { key: "cliente.carta_emissao", label: "Data de emissão da carta" },
  { key: "cliente.nascimento", label: "Data de nascimento" },
  { key: "cliente.nacionalidade", label: "Nacionalidade" },
  { key: "viatura.marca", label: "Marca" },
  { key: "viatura.modelo", label: "Modelo" },
  { key: "viatura.versao", label: "Versão" },
  { key: "viatura.marca_modelo", label: "Marca e modelo" },
  { key: "viatura.matricula", label: "Matrícula" },
  { key: "viatura.vin", label: "Nº de quadro (VIN)" },
  { key: "viatura.ano", label: "Ano" },
  { key: "viatura.primeira_matricula", label: "Data da 1.ª matrícula" },
  { key: "viatura.primeiro_registo", label: "1.º registo (dd-mm-aaaa)" },
  { key: "viatura.km", label: "Quilómetros" },
  { key: "viatura.cor", label: "Cor" },
  { key: "viatura.combustivel", label: "Combustível" },
  { key: "viatura.transmissao", label: "Transmissão" },
  { key: "viatura.cilindrada", label: "Cilindrada" },
  { key: "viatura.potencia_kw", label: "Potência (kW)" },
  { key: "viatura.tracao_4x4", label: "4x4" },
  { key: "viatura.categoria_pt", label: "Categoria" },
  { key: "viatura.tipo_pt", label: "Tipo de veículo" },
  { key: "viatura.lugares", label: "Lugares sentados" },
  { key: "consignacao.marca", label: "Marca do carro em consignação" },
  { key: "consignacao.modelo", label: "Modelo do carro em consignação" },
  { key: "consignacao.matricula", label: "Matrícula do carro em consignação" },
  { key: "consignacao.ano", label: "Ano do carro em consignação" },
  { key: "consignacao.vin", label: "Nº de quadro (VIN) do carro em consignação" },
  { key: "consignacao.km", label: "Quilometragem do carro em consignação" },
  { key: "consignacao.preco_minimo", label: "Preço mínimo de venda" },
  { key: "consignacao.preco_extenso", label: "Preço mínimo por extenso" },
  { key: "consignacao.iban", label: "IBAN do consignante" },
  { key: "venda.preco", label: "Preço de venda" },
  { key: "venda.data", label: "Data" },
  { key: "venda.data_extenso", label: "Data por extenso" },
  { key: "venda.hora", label: "Hora" },
  { key: "venda.local", label: "Localidade" },
  { key: "venda.km_entrega", label: "Km na entrega" },
  { key: "venda.observacoes", label: "Observações" },
  { key: "garantia.prazo", label: "Prazo da garantia (meses)" },
  { key: "garantia.numero", label: "Nº da garantia" },
  { key: "garantia.inicio", label: "Início da garantia" },
  { key: "garantia.fim", label: "Fim da garantia" },
  { key: "garantia.entrega", label: "Data de entrega" },
  { key: "garantia.complementos", label: "Complementos e opções" },
  { key: "aluguer.inicio", label: "Início do aluguer (dia)" },
  { key: "aluguer.inicio_hora", label: "Hora de início" },
  { key: "aluguer.fim", label: "Fim do aluguer (dia)" },
  { key: "aluguer.fim_hora", label: "Hora de fim" },
  { key: "aluguer.km_saida", label: "Quilometragem na entrega" },
  { key: "aluguer.valor", label: "Valor total / renda (€)" },
  { key: "aluguer.forma_pagamento", label: "Forma de pagamento" },
  { key: "aluguer.estado_geral", label: "Estado geral do veículo" },
];

const VEHICLE_TABLE = [
  [
    { label: "Marca", value: "{{viatura.marca}}" },
    { label: "Modelo", value: "{{viatura.modelo}} {{viatura.versao}}" },
  ],
  [
    { label: "Matrícula", value: "{{viatura.matricula}}" },
    { label: "Nº de quadro (VIN)", value: "{{viatura.vin}}" },
  ],
  [
    { label: "1.ª matrícula", value: "{{viatura.primeira_matricula}}" },
    { label: "Quilómetros", value: "{{venda.km_entrega}}" },
  ],
];

export const DEFAULT_TEMPLATES: Record<TemplateId, FormTemplate> = {
  termo_garantia: {
    id: "termo_garantia",
    title: "Termo de garantia",
    description: "Entregue ao comprador na venda: dados do vendedor, cliente, viatura e período da garantia.",
    needsCustomer: true,
    needsVehicle: true,
    mode: "sale",
    body: "Garantia de {{garantia.prazo}} meses, de {{garantia.inicio}} a {{garantia.fim}}, sobre a viatura abaixo, vendida por {{empresa.nome}} a {{cliente.nome}}.",
    table: VEHICLE_TABLE,
    signatures: ["Representante Legal (Nome e Apelidos), Carimbo e Assinatura", "O Comprador"],
  },
  declaracao_circulacao: {
    id: "declaracao_circulacao",
    title: "Declaração de circulação",
    description: "Permite ao comprador circular com a viatura enquanto o registo não está concluído (válida 60 dias).",
    needsCustomer: true,
    needsVehicle: true,
    mode: "sale",
    body: "{{empresa.nome}}, com o NIF {{empresa.nipc}} e com a sede em {{empresa.morada}}, declara para os devidos efeitos ter vendido como intermediária a {{cliente.nome}} com {{cliente.documento}}, {{cliente.morada}}, a viatura usada abaixo.",
    table: VEHICLE_TABLE,
    signatures: ["{{empresa.nome}}"],
  },
  contrato_consignacao: {
    id: "contrato_consignacao",
    title: "Contrato de consignação",
    description: "O cliente deixa o carro dele no stand para vendermos: preço mínimo (também por extenso), 90 dias e IBAN para o pagamento.",
    needsCustomer: true,
    needsVehicle: false,
    mode: "sale",
    body: `Contrato de consignação entre {{cliente.nome}}, NIF {{cliente.nif}}, {{cliente.morada}} (Consignante) e {{empresa.nome}}, NIF {{empresa.nipc}}, {{empresa.morada}} (Consignatário), para venda do veículo {{consignacao.marca}} {{consignacao.modelo}}, matrícula {{consignacao.matricula}}, pelo preço mínimo de {{consignacao.preco_minimo}} [{{consignacao.preco_extenso}}], durante 90 dias, com pagamento no momento da venda para o IBAN {{consignacao.iban}}.

Feito e assinado em duplicado, em {{venda.local}}, aos {{venda.data_extenso}}.`,
    table: [],
    signatures: ["O Consignante", "O Consignatário"],
  },
  contrato_locacao: {
    id: "contrato_locacao",
    title: "Contrato de locação",
    description: "Termo de responsabilidade da viatura alugada: locatário, viatura, prazo e valor.",
    needsCustomer: true,
    needsVehicle: true,
    mode: "rent",
    body: "{{empresa.nome}} aluga a {{cliente.nome}} a viatura abaixo, de {{aluguer.inicio}} às {{aluguer.inicio_hora}} horas até {{aluguer.fim}} às {{aluguer.fim_hora}} horas, por {{aluguer.valor}} euros.",
    table: VEHICLE_TABLE,
    signatures: ["O Locador", "O Locatário"],
  },
  declaracao_compra: {
    id: "declaracao_compra",
    title: "Declaração de venda de viatura ao stand",
    description: "Quando uma viatura entra no stand (compra ou retoma): o particular declara a venda e a entrega.",
    needsCustomer: true,
    needsVehicle: true,
    mode: "sale",
    body: `{{cliente.nome}}, NIF {{cliente.nif}}, portador(a) do documento {{cliente.documento}}, residente em {{cliente.morada}}, declara que vendeu a {{empresa.nome}}, NIPC {{empresa.nipc}}, pelo preço de {{venda.preco}}, a viatura identificada no quadro abaixo, de que é legítimo(a) proprietário(a), livre de ónus ou encargos.

Declara ainda que entrega nesta data, {{venda.data}}, às {{venda.hora}}, a viatura com {{venda.km_entrega}} km, os respetivos documentos e chaves, e que até este momento é responsável por coimas, portagens, impostos e quaisquer factos ocorridos com a viatura.

Compromete-se a assinar o Requerimento de Registo Automóvel necessário à transmissão da propriedade. {{venda.observacoes}}`,
    table: VEHICLE_TABLE,
    signatures: ["O vendedor ({{cliente.nome}})", "Pelo stand ({{empresa.nome}})"],
  },
  ficha_cliente: {
    id: "ficha_cliente",
    title: "Ficha de cliente",
    description: "Dados de identificação e contacto do cliente, para arquivo.",
    needsCustomer: true,
    needsVehicle: false,
    mode: "any",
    body: `Dados recolhidos por {{empresa.nome}} em {{venda.data}} para a preparação do negócio. O cliente confirma que os dados abaixo estão corretos.`,
    table: [
      [{ label: "Nome", value: "{{cliente.nome}}" }],
      [
        { label: "NIF", value: "{{cliente.nif}}" },
        { label: "Documento", value: "{{cliente.documento}}" },
      ],
      [
        { label: "Validade", value: "{{cliente.validade_documento}}" },
        { label: "Nascimento", value: "{{cliente.nascimento}}" },
      ],
      [{ label: "Morada", value: "{{cliente.morada}}" }],
      [
        { label: "Telefone", value: "{{cliente.telefone}}" },
        { label: "E-mail", value: "{{cliente.email}}" },
      ],
      [
        { label: "Nacionalidade", value: "{{cliente.nacionalidade}}" },
        { label: "Carta de condução", value: "{{cliente.carta}}" },
      ],
    ],
    signatures: ["O cliente"],
  },
  dados_registo: {
    id: "dados_registo",
    title: "Dados para o Requerimento de Registo Automóvel",
    description: "Folha de apoio com os dados de vendedor, comprador e viatura para o requerimento do IRN ou o Automóvel Online.",
    needsCustomer: true,
    needsVehicle: true,
    mode: "sale",
    body: `Folha de apoio ao preenchimento do Requerimento de Registo Automóvel (registo de propriedade por contrato verbal de compra e venda). Data do contrato: {{venda.data}}.`,
    table: [
      [{ label: "Sujeito passivo (vendedor)", value: "{{empresa.nome}} — NIPC {{empresa.nipc}}" }],
      [{ label: "Morada do vendedor", value: "{{empresa.morada}}" }],
      [{ label: "Sujeito ativo (comprador)", value: "{{cliente.nome}} — NIF {{cliente.nif}}" }],
      [{ label: "Documento do comprador", value: "{{cliente.documento}}" }],
      [{ label: "Morada do comprador", value: "{{cliente.morada}}" }],
      ...VEHICLE_TABLE,
      [{ label: "Preço", value: "{{venda.preco}}" }],
    ],
    signatures: [],
  },
};

export const TEMPLATE_IDS = Object.keys(DEFAULT_TEMPLATES) as TemplateId[];

/** Documentos gerados por omissão em cada operação. */
export const DEAL_DOCUMENTS: Record<DealMode, TemplateId[]> = {
  sale: ["termo_garantia", "declaracao_circulacao"],
  rent: ["contrato_locacao"],
};

/** Títulos de documentos antigos (para o histórico). */
export const LEGACY_TITLES: Record<string, string> = {
  termo_responsabilidade: "Termo de entrega e responsabilidade",
  contrato_compra_venda: "Contrato de compra e venda de viatura",
};

export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => values[key]?.trim() || "________________");
}
