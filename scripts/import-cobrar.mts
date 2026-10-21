/**
 * Importa as cobranças da app Cobrar (pasta cobrar/, SQLite) para o painel (Supabase).
 * Idempotente: os ids importados são fixos (cob_imp_*, pre_imp_*, pag_imp_*) e não se duplicam.
 * Clientes: liga ao cliente do painel com o mesmo nome (ou NIF); senão cria a ficha.
 *   npm run cobrar:importar
 */
import { config } from "dotenv";
import { DatabaseSync } from "node:sqlite";
import { eq, ilike } from "drizzle-orm";
import { createDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { isValidNif } from "../src/lib/pt-validation";

config({ path: [".env.local", ".env"], quiet: true });

const file = process.argv[2] ?? "cobrar/data/cobrar.db";
const src = new DatabaseSync(file, { readOnly: true });
const db = createDb();

type Row = Record<string, string | number | null>;
const all = (q: string) => src.prepare(q).all() as Row[];
const str = (v: unknown) => (v == null ? "" : String(v).trim());

const clients = all("SELECT * FROM clientes ORDER BY id");
const contracts = all("SELECT * FROM contratos ORDER BY id");
const installments = all("SELECT * FROM parcelas ORDER BY id");
const payments = all("SELECT * FROM pagamentos ORDER BY id");

const customerFor = new Map<number, string>();
let createdCustomers = 0;
for (const c of clients) {
  const name = str(c.nome);
  const doc = str(c.documento).replace(/\s/g, "");
  const nif = /^\d{9}$/.test(doc) && isValidNif(doc) ? doc : null;
  let existing = nif ? (await db.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.nif, nif)).limit(1))[0] : undefined;
  existing ??= (await db.select({ id: schema.customers.id }).from(schema.customers).where(ilike(schema.customers.fullName, name)).limit(1))[0];
  if (existing) {
    customerFor.set(Number(c.id), existing.id);
    continue;
  }
  const id = `cus_imp_cobrar_${c.id}`;
  await db
    .insert(schema.customers)
    .values({
      id,
      fullName: name,
      phone: str(c.telefone) || null,
      email: str(c.email) || null,
      nif,
      idDocumentNumber: !nif && doc ? doc : null,
      address: str(c.morada) || null,
      notes: str(c.notas) || null,
      source: "Cobranças",
    })
    .onConflictDoNothing();
  customerFor.set(Number(c.id), id);
  createdCustomers++;
}

for (const k of contracts)
  await db
    .insert(schema.chargeContracts)
    .values({
      id: `cob_imp_${k.id}`,
      customerId: customerFor.get(Number(k.cliente_id))!,
      make: str(k.marca),
      model: str(k.modelo),
      color: str(k.cor),
      year: k.ano == null ? null : Number(k.ano),
      plate: str(k.matricula).toUpperCase(),
      vin: str(k.vin).toUpperCase(),
      deliveryDate: str(k.data_entrega) || null,
      saleCents: Number(k.valor_venda) || 0,
      financedCents: Number(k.valor_financiado) || 0,
      // Na Cobrar cobrava-se a venda menos o financiado pelo banco (a entrada entrava como pagamento).
      debtCents: Math.max(0, (Number(k.valor_venda) || 0) - (Number(k.valor_financiado) || 0)),
      notes: str(k.notas),
    })
    .onConflictDoNothing();

for (const p of installments)
  await db
    .insert(schema.chargeInstallments)
    .values({ id: `pre_imp_${p.id}`, contractId: `cob_imp_${p.contrato_id}`, dueDate: str(p.vencimento), amountCents: Number(p.valor), note: str(p.nota) })
    .onConflictDoNothing();

for (const p of payments)
  await db
    .insert(schema.chargePayments)
    .values({
      id: `pag_imp_${p.id}`,
      contractId: `cob_imp_${p.contrato_id}`,
      installmentId: p.parcela_id == null ? null : `pre_imp_${p.parcela_id}`,
      date: str(p.data),
      amountCents: Number(p.valor),
      method: str(p.metodo) || "dinheiro",
      note: str(p.nota),
    })
    .onConflictDoNothing();

console.log(
  `✓ Importado da Cobrar: ${contracts.length} venda(s), ${installments.length} prestação(ões), ${payments.length} pagamento(s); ${createdCustomers} cliente(s) novo(s), ${clients.length - createdCustomers} ligado(s) a fichas existentes.`,
);
