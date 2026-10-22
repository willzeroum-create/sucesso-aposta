/** Valores por extenso em português de Portugal (declarações: "5 000,00 € (cinco mil euros)"). */

const UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 1–999: "cento e vinte e três". */
function below1000(n: number): string {
  if (n === 100) return "cem";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    parts.push(rest < 20 ? UNITS[rest] : u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
  }
  return parts.join(" e ");
}

/** Inteiro por extenso, até 999 999 999 ("mil e quinhentos", "dois mil trezentos e dez"). */
export function integerWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const groups: { words: string; value: number }[] = [];
  const millions = Math.floor(n / 1_000_000) % 1000;
  const thousands = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  if (millions) groups.push({ words: millions === 1 ? "um milhão" : `${below1000(millions)} milhões`, value: millions });
  if (thousands) groups.push({ words: thousands === 1 ? "mil" : `${below1000(thousands)} mil`, value: thousands });
  if (rest) groups.push({ words: below1000(rest), value: rest });
  // "e" só antes do último grupo, quando este é menor que 100 ou uma centena certa.
  return groups
    .map((g, i) => (i === 0 ? g.words : i === groups.length - 1 && (g.value < 100 || g.value % 100 === 0) ? `e ${g.words}` : g.words))
    .join(" ");
}

/** 5000 → "cinco mil euros"; 1250.5 → "mil duzentos e cinquenta euros e cinquenta cêntimos". */
export function eurosPorExtenso(value: number): string {
  const totalCents = Math.round(Math.abs(value) * 100);
  const euros = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const parts: string[] = [];
  if (euros || !cents) {
    const de = euros >= 1_000_000 && euros % 1_000_000 === 0 ? " de" : "";
    parts.push(`${integerWords(euros)}${de} ${euros === 1 ? "euro" : "euros"}`);
  }
  if (cents) parts.push(`${integerWords(cents)} ${cents === 1 ? "cêntimo" : "cêntimos"}`);
  return parts.join(" e ");
}

/** "5 000,50 €" / "5000.5" / "5.000,50" → 5000.5 (vazio ou inválido → null). */
export function parseEuros(text: string): number | null {
  const s = text.replace(/\s|€/g, "");
  if (!s) return null;
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
