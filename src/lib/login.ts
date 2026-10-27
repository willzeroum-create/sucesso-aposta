/**
 * Utilizador para entrar no painel: um nome simples (ex.: "Ítalo") ou um e-mail.
 * Guarda-se e compara-se sem maiúsculas nem acentos, para "Ítalo", "italo" e "ITALO" darem o mesmo.
 */
export function normalizeLogin(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}
