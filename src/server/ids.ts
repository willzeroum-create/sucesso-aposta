import "server-only";
import { randomBytes } from "node:crypto";

const alphabet = "0123456789abcdefghijkmnopqrstuvwxyz";

/** Identificador curto, ordenável por criação e seguro para URLs, ex.: veh_lx3k9a2b7c4d8e1f. */
export function newId(prefix: string): string {
  const time = Date.now().toString(36);
  const bytes = randomBytes(10);
  let rand = "";
  for (const byte of bytes) rand += alphabet[byte % alphabet.length];
  return `${prefix}_${time}${rand}`;
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
