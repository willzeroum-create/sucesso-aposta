import { createRequire } from "node:module";
import type { Client } from "@libsql/client";
import { createClient as createHttpClient } from "@libsql/client/http";
import { databaseConfig } from "./config";

export { databaseConfig } from "./config";

/**
 * Remoto → cliente HTTP (JavaScript puro, compatível com serverless).
 * Ficheiro local → cliente nativo carregado por require dinâmico, para não entrar no bundle de produção.
 */
export function createLibsqlClient(): Client {
  const { url, authToken, remote } = databaseConfig();
  if (!remote) {
    const require = createRequire(import.meta.url);
    const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
    return createClient({ url, authToken });
  }
  return createHttpClient({ url: url.replace(/^libsql:/, "https:"), authToken });
}
