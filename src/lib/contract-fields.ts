/**
 * Passo "Dados do documento": a lista de campos {{...}} que os documentos escolhidos usam, já preenchidos,
 * revista e completada antes de gerar. Partilhado pela venda/aluguer da viatura e pelas declarações avulsas.
 */
import { eurosPorExtenso, parseEuros } from "./extenso";
import { PLACEHOLDERS } from "./form-templates";

export type ContractField = { key: string; label: string; group: string; value: string; required: boolean; savesTo: string | null };

/** Campos que podem ficar vazios; todos os outros são obrigatórios para gerar. */
export const OPTIONAL_FIELDS = new Set([
  "venda.observacoes", "cliente.email", "cliente.telefone", "garantia.complementos", "garantia.numero", "empresa.instagram",
  "viatura.versao", "empresa.representante", "empresa.cargo",
]);

const ORDER = PLACEHOLDERS.map((p) => p.key);
export const FIELD_LABEL: Record<string, string> = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.label]));

export const fieldGroup = (key: string, mode: "sale" | "rent") =>
  ({
    empresa: mode === "rent" ? "Empresa (locador)" : "Empresa (vendedor)",
    cliente: mode === "rent" ? "Locatário" : "Cliente",
    viatura: "Viatura",
    consignacao: "Carro em consignação",
    venda: mode === "rent" ? "Contrato" : "Venda",
    garantia: "Garantia",
    aluguer: "Aluguer",
  })[key.split(".")[0]] ?? "Outros";

/** Ordena as chaves pela ordem da lista de campos (empresa, cliente, viatura, consignação, venda…). */
export function sortFieldKeys(keys: Iterable<string>): string[] {
  const pos = (k: string) => (ORDER.indexOf(k) === -1 ? 999 : ORDER.indexOf(k));
  return [...keys].sort((a, b) => pos(a) - pos(b));
}

const eur = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** Antes de gerar: valores em euros escritos à mão ("15000") saem no formato do documento ("15 000,00 €"). */
export function normalizeValues(values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  const n = out["consignacao.preco_minimo"] ? parseEuros(out["consignacao.preco_minimo"]) : null;
  if (n) out["consignacao.preco_minimo"] = eur.format(n);
  return out;
}

/** Ao corrigir o preço mínimo no passo de revisão, o extenso acompanha. */
export function withDerived(key: string, value: string): Record<string, string> {
  if (key === "consignacao.preco_minimo") {
    const n = parseEuros(value);
    return { [key]: value, ...(n ? { "consignacao.preco_extenso": eurosPorExtenso(n) } : {}) };
  }
  return { [key]: value };
}
