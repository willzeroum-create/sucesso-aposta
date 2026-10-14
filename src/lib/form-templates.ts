/**
 * Modelos de termos e declarações (partilháveis com o cliente para pré-visualização).
 * O texto é editável no painel (Configurações → Modelos): o stand pode colar o termo que já usa,
 * mantendo os campos {{...}}. Estes textos-base são uma proposta e devem ser revistos pelo stand
 * ou por um jurista antes de uso. A declaração de venda oficial continua a ser o Requerimento de
 * Registo Automóvel do IRN; estes documentos complementam-no.
 */

export type TemplateId =
  | "termo_responsabilidade"
  | "contrato_compra_venda"
  | "declaracao_compra"
  | "ficha_cliente"
  | "dados_registo";

export interface FormTemplate {
  id: TemplateId;
  title: string;
  description: string;
  needsCustomer: boolean;
  needsVehicle: boolean;
  /** Parágrafos separados por linha em branco. */
  body: string;
  /** Quadro de dados impresso depois do texto. */
  table: { label: string; value: string }[][];
  signatures: string[];
}

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "empresa.nome", label: "Nome legal do stand" },
  { key: "empresa.nipc", label: "NIPC do stand" },
  { key: "empresa.morada", label: "Morada do stand" },
  { key: "empresa.representante", label: "Representante" },
  { key: "empresa.cargo", label: "Cargo do representante" },
  { key: "cliente.nome", label: "Nome do cliente" },
  { key: "cliente.nif", label: "NIF do cliente" },
  { key: "cliente.documento", label: "Tipo e nº do documento" },
  { key: "cliente.validade_documento", label: "Validade do documento" },
  { key: "cliente.morada", label: "Morada completa do cliente" },
  { key: "cliente.telefone", label: "Telefone" },
  { key: "cliente.email", label: "E-mail" },
  { key: "cliente.carta", label: "Nº da carta de condução" },
  { key: "cliente.nascimento", label: "Data de nascimento" },
  { key: "cliente.nacionalidade", label: "Nacionalidade" },
  { key: "viatura.marca", label: "Marca" },
  { key: "viatura.modelo", label: "Modelo e versão" },
  { key: "viatura.matricula", label: "Matrícula" },
  { key: "viatura.vin", label: "Nº de quadro (VIN)" },
  { key: "viatura.ano", label: "Ano" },
  { key: "viatura.primeira_matricula", label: "Data da 1.ª matrícula" },
  { key: "viatura.km", label: "Quilómetros" },
  { key: "viatura.cor", label: "Cor" },
  { key: "viatura.combustivel", label: "Combustível" },
  { key: "venda.preco", label: "Preço de venda" },
  { key: "venda.data", label: "Data" },
  { key: "venda.hora", label: "Hora" },
  { key: "venda.local", label: "Localidade" },
  { key: "venda.km_entrega", label: "Km na entrega" },
  { key: "venda.observacoes", label: "Observações" },
];

const VEHICLE_TABLE = [
  [
    { label: "Marca", value: "{{viatura.marca}}" },
    { label: "Modelo", value: "{{viatura.modelo}}" },
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
  termo_responsabilidade: {
    id: "termo_responsabilidade",
    title: "Termo de entrega e responsabilidade",
    description: "Entregue ao comprador no momento da entrega, enquanto o registo de propriedade não está concluído.",
    needsCustomer: true,
    needsVehicle: true,
    body: `{{empresa.nome}}, NIPC {{empresa.nipc}}, com sede em {{empresa.morada}}, aqui representada por {{empresa.representante}}, na qualidade de {{empresa.cargo}}, declara que nesta data, {{venda.data}}, às {{venda.hora}}, entregou a viatura abaixo identificada a {{cliente.nome}}, NIF {{cliente.nif}}, portador(a) do documento {{cliente.documento}}, residente em {{cliente.morada}}.

A partir da data e hora indicadas, o comprador assume a posse da viatura e toda a responsabilidade civil, criminal e contraordenacional decorrente da sua utilização e circulação, incluindo coimas, portagens, estacionamento e acidentes, bem como a obrigação de manter um seguro de responsabilidade civil automóvel válido.

O vendedor compromete-se a entregar os documentos necessários ao registo de propriedade a favor do comprador, a efetuar através do Requerimento de Registo Automóvel, no prazo legal de 60 dias a contar desta data.

A viatura é entregue com {{venda.km_entrega}} km, no estado em que foi vista e aceite pelo comprador. {{venda.observacoes}}`,
    table: VEHICLE_TABLE,
    signatures: ["O vendedor ({{empresa.nome}})", "O comprador ({{cliente.nome}})"],
  },
  contrato_compra_venda: {
    id: "contrato_compra_venda",
    title: "Contrato de compra e venda de viatura",
    description: "Contrato entre o stand e o cliente, com preço, identificação da viatura e garantia.",
    needsCustomer: true,
    needsVehicle: true,
    body: `Primeiro outorgante (vendedor): {{empresa.nome}}, NIPC {{empresa.nipc}}, com sede em {{empresa.morada}}, representada por {{empresa.representante}}.

Segundo outorgante (comprador): {{cliente.nome}}, NIF {{cliente.nif}}, documento {{cliente.documento}}, residente em {{cliente.morada}}.

1. O primeiro outorgante vende ao segundo, que compra, a viatura identificada no quadro abaixo, pelo preço de {{venda.preco}}, que o segundo outorgante declara pagar nesta data.

2. A viatura é entregue com {{venda.km_entrega}} km. O comprador declara tê-la examinado e experimentado.

3. O vendedor garante a viatura nos termos da legislação aplicável à venda de bens de consumo, com o prazo acordado entre as partes e indicado nas observações.

4. O registo de propriedade a favor do comprador será requerido no prazo legal, através do Requerimento de Registo Automóvel.

Observações: {{venda.observacoes}}

Feito em {{venda.local}}, a {{venda.data}}, em dois exemplares de igual valor.`,
    table: VEHICLE_TABLE,
    signatures: ["O vendedor", "O comprador"],
  },
  declaracao_compra: {
    id: "declaracao_compra",
    title: "Declaração de venda de viatura ao stand",
    description: "Quando uma viatura entra no stand (compra ou retoma): o particular declara a venda e a entrega.",
    needsCustomer: true,
    needsVehicle: true,
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
    description: "Folha de apoio com os dados de vendedor, comprador e viatura para preencher o requerimento do IRN ou o Automóvel Online.",
    needsCustomer: true,
    needsVehicle: true,
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

export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => values[key]?.trim() || "________________");
}
