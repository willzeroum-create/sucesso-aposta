/**
 * Publica na Vercel: envia as variáveis de produção que estão no .env.local (sem as mostrar) e faz o deploy.
 *   npm run publicar            (npm run publicar -- --testar mostra o que seria enviado, sem enviar)
 * Precisa da Vercel CLI com sessão iniciada e da pasta ligada ao projeto (vercel link).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

/** [nome, é segredo]. Nunca se enviam palavras-passe de teste nem variáveis de desenvolvimento. */
const PRODUCTION_VARS = [
  ["SUPABASE_URL", false],
  ["SUPABASE_SERVICE_ROLE_KEY", true],
  ["SUPABASE_SECRET_KEY", true],
  ["SUPABASE_STORAGE_BUCKET", false],
  ["GEMINI_API_KEY", true],
  ["GEMINI_MODEL", false],
  ["ANTHROPIC_API_KEY", true],
  ["ANTHROPIC_MODEL", false],
  ["IA_PROVIDER", false],
  ["META_ADS_ACCESS_TOKEN", true],
  ["META_AD_ACCOUNT_ID", false],
  ["GOOGLE_ADS_DEVELOPER_TOKEN", true],
  ["GOOGLE_ADS_CLIENT_ID", false],
  ["GOOGLE_ADS_CLIENT_SECRET", true],
  ["GOOGLE_ADS_REFRESH_TOKEN", true],
  ["GOOGLE_ADS_CUSTOMER_ID", false],
  ["GOOGLE_ADS_LOGIN_CUSTOMER_ID", false],
  ["VINDECODER_EU_API_KEY", true],
  ["VINDECODER_EU_SECRET", true],
];
/** Valores fixos de produção. */
const FIXED = { CATALOG_MODE: "database", STORAGE_DRIVER: "supabase" };

const dryRun = process.argv.includes("--testar");
if (!existsSync(".vercel/project.json")) {
  console.error("Esta pasta ainda não está ligada a um projeto da Vercel. Corra: vercel link");
  process.exit(1);
}
const env = {};
if (existsSync(".env.local"))
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
if (env.SUPABASE_URL) env.SUPABASE_URL = env.SUPABASE_URL.replace(/\/(rest|storage)\/v1\/?$/, "").replace(/\/+$/, "");

const vercel = (args, input) =>
  spawnSync("vercel", args, { input, encoding: "utf8", shell: process.platform === "win32", stdio: input === undefined ? "inherit" : ["pipe", "pipe", "pipe"] });

const existing = new Set(
  (vercel(["env", "ls", "production"], "").stdout ?? "").split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean),
);

function put(name, value, secret) {
  if (dryRun) return console.log(`  • ${name}${secret ? " (secreta)" : ""}`);
  vercel(["env", "rm", name, "production", "--yes"], "");
  const r = vercel(["env", "add", name, "production", ...(secret ? ["--sensitive"] : [])], value);
  console.log(r.status === 0 ? `  ✓ ${name}` : `  ✗ ${name}: ${(r.stderr || r.stdout || "").trim().split("\n").pop()}`);
}

console.log(dryRun ? "\nTeste: nada será enviado.\n" : "\nA enviar as configurações para a Vercel…\n");
for (const [name, value] of Object.entries(FIXED)) put(name, value, false);
for (const [name, secret] of PRODUCTION_VARS) if (env[name]) put(name, env[name], secret);
// Sal para pseudonimizar IPs dos pedidos: criado uma vez, nunca reenviado.
if (!existing.has("SESSION_SECRET")) put("SESSION_SECRET", randomBytes(32).toString("hex"), true);

if (dryRun) process.exit(0);
console.log("\nA publicar…\n");
const deploy = vercel(["deploy", "--prod", "--yes"]);
process.exit(deploy.status ?? 1);
