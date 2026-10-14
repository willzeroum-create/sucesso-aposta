import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 2 ** 15;
const BLOCK = 8;
const PARALLEL = 1;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost = COST): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: cost, r: BLOCK, p: PARALLEL, maxmem: MAX_MEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

/** Formato: scrypt$N$salt(base64)$hash(base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${COST}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), Number(cost));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash fixo usado quando o email não existe, para o tempo de resposta não revelar contas. */
let dummy: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  return dummy;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "A palavra-passe precisa de pelo menos 10 caracteres.";
  if (password.length > 200) return "A palavra-passe é demasiado longa.";
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password))
    return "Use letras e algarismos na palavra-passe.";
  return null;
}
