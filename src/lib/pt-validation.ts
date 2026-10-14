/** Validações portuguesas puras (partilháveis com o cliente). Matrículas e datas portadas do LegalCar. */

/** NIF/NIPC: 9 algarismos com dígito de controlo módulo 11. */
export function isValidNif(value: string | null | undefined): boolean {
  const nif = (value ?? "").replace(/\D/g, "");
  if (!/^[1-35-9]\d{8}$/.test(nif) && !/^45\d{7}$/.test(nif)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(nif[i]) * (9 - i);
  const rest = sum % 11;
  const check = rest < 2 ? 0 : 11 - rest;
  return check === Number(nif[8]);
}

const PLATE_FORMATS = [
  /^[A-Z]{2}\d{2}[A-Z]{2}$/, // desde 2020
  /^\d{2}[A-Z]{2}\d{2}$/, // 1992–2005
  /^\d{4}[A-Z]{2}$/, // 2005–2020
  /^[A-Z]{2}\d{4}$/, // até 1992
];

export function normalizePlate(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isPortuguesePlate(value: string | null | undefined): boolean {
  const n = normalizePlate(value);
  return PLATE_FORMATS.some((f) => f.test(n));
}

/** "ce05sb" → "CE-05-SB". Matrículas estrangeiras ficam só em maiúsculas. */
export function formatPlate(value: string | null | undefined): string {
  const n = normalizePlate(value);
  if (!isPortuguesePlate(n)) return (value ?? "").trim().toUpperCase();
  return `${n.slice(0, 2)}-${n.slice(2, 4)}-${n.slice(4, 6)}`;
}

const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Formato ISO 3779: 17 caracteres, sem I, O nem Q. */
export function isValidVinFormat(value: string | null | undefined): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(normalizeVin(value));
}

/**
 * Dígito de controlo (posição 9). Obrigatório na América do Norte; os fabricantes europeus
 * nem sempre o usam, por isso uma falha é só um aviso, não um erro.
 */
export function vinCheckDigitMatches(value: string | null | undefined): boolean {
  const vin = normalizeVin(value);
  if (!isValidVinFormat(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const v = /\d/.test(c) ? Number(c) : VIN_VALUES[c] ?? 0;
    sum += v * VIN_WEIGHTS[i];
  }
  const rest = sum % 11;
  return vin[8] === (rest === 10 ? "X" : String(rest));
}

export function isValidPostalCodePt(value: string | null | undefined): boolean {
  return /^\d{4}-\d{3}$/.test((value ?? "").trim());
}

/** "1000123" / "1000 123" → "1000-123". */
export function formatPostalCodePt(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 7 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : (value ?? "").trim();
}

/**
 * Datas em AAAA-MM-DD. Aceita "15.03.2012", "15/03/2012", "15-03-2012", "2012-03-15" e "20120315".
 * Inválida → "".
 */
export function normalizeDate(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  let y: number, m: number, d: number;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+match[1], +match[2], +match[3]];
  else if ((match = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) [d, m, y] = [+match[1], +match[2], +match[3]];
  else if ((match = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [+match[1], +match[2], +match[3]];
  else return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  if (y < 1900 || y > new Date().getUTCFullYear() + 15) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1.880 kg" → 1880; "1880,5" → 1880.5; lixo → null. */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = (value ?? "").toString().replace(/\s|kg|mm|cm3|cm³|km|cv|g\/km|lugares?/gi, "");
  if (!s) return null;
  const clean = /^\d{1,3}([.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, "") : s.replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function formatDatePt(iso: string | null | undefined): string {
  const s = normalizeDate(iso);
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
