/**
 * Copia a base local antiga (data/app.db, SQLite) para o PostgreSQL (Supabase) e os ficheiros de
 * data/uploads para o Supabase Storage. Idempotente: o que já existe no destino não é alterado.
 *   npm.cmd run db:copy-local
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { runSql } from "../src/db/client";

config({ path: [".env.local", ".env"], quiet: true });

const SOURCE = "data/app.db";
if (!existsSync(SOURCE)) {
  console.log("Não há base local (data/app.db). Nada a copiar.");
  process.exit(0);
}

const require = createRequire(import.meta.url);
const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
const lite = createClient({ url: `file:${SOURCE}` });

// Ordem respeita as chaves estrangeiras. Sessões e limites de pedidos não se copiam.
const TABLES = ["roles", "users", "files", "settings", "vehicles", "vehicle_photos", "customers", "leads", "lead_events", "documents", "generated_forms", "hero_slides", "hero_jobs", "audit_logs"];

let total = 0;
for (const table of TABLES) {
  const exists = await lite.execute({ sql: "select name from sqlite_master where type='table' and name=?", args: [table] });
  if (!exists.rows.length) continue;
  const cols = (await runSql("select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1", [table])) as { column_name: string; data_type: string }[];
  const types = new Map(cols.map((c) => [c.column_name, c.data_type]));
  const rows = (await lite.execute(`select * from ${table}`)).rows;
  let copied = 0;
  for (const row of rows) {
    const record: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(row)) {
      const type = types.get(key);
      if (!type) continue;
      if (raw === null || raw === undefined) record[key] = null;
      else if (type.startsWith("timestamp")) record[key] = new Date(Number(raw));
      else if (type === "boolean") record[key] = Boolean(Number(raw));
      else if (type === "jsonb") record[key] = typeof raw === "string" ? raw : JSON.stringify(raw);
      else if (type === "integer" || type === "bigint" || type === "double precision") record[key] = Number(raw);
      else record[key] = String(raw);
    }
    const keys = Object.keys(record);
    const inserted = await runSql(
      `insert into "${table}" (${keys.map((k) => `"${k}"`).join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) on conflict do nothing returning 1`,
      keys.map((k) => record[k]),
    );
    copied += inserted.length;
  }
  total += copied;
  console.log(`  ${table}: ${copied} de ${rows.length} copiados`);
}

// Ficheiros → Supabase Storage (mesma chave).
const base = `${(process.env.SUPABASE_URL ?? "").replace(/\/(rest|storage)\/v1\/?$/, "").replace(/\/+$/, "")}/storage/v1`;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "stand";
if (process.env.SUPABASE_URL && key) {
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  const files = (await lite.execute("select storage_key, mime from files")).rows;
  let up = 0;
  for (const f of files) {
    const local = path.join("data", "uploads", String(f.storage_key));
    if (!existsSync(local)) continue;
    const res = await fetch(`${base}/object/${bucket}/${String(f.storage_key).split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": String(f.mime), "x-upsert": "false" },
      body: new Uint8Array(readFileSync(local)),
    });
    if (res.ok || res.status === 409 || res.status === 400) up++;
  }
  console.log(`  ficheiros no Storage: ${up} de ${files.length}`);
}

lite.close();
console.log(`✓ Cópia concluída (${total} registos novos).`);
