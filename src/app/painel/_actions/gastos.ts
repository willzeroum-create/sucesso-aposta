"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { ActionResult } from "@/lib/action-result";
import { EXPENSE_KINDS, type ExpenseKind } from "@/lib/gastos";
import { audit } from "@/server/audit";
import { assertPermission } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { run, UserError } from "@/server/action";

const expenseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  person: z.string().trim().min(1, "Indique quem gastou ou pagou.").max(80),
  kind: z.enum(Object.keys(EXPENSE_KINDS) as [ExpenseKind, ...ExpenseKind[]]),
  description: z.string().trim().max(300).default(""),
  amount: z.coerce.number({ message: "Indique o valor." }).positive("O valor tem de ser maior do que zero.").max(10_000_000),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

const eur = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
const clean = (d: z.output<typeof expenseSchema>) => ({ ...d, person: d.person.replace(/\s+/g, " ") });

export async function addExpense(raw: ExpenseInput): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("expenses.manage");
    const d = clean(expenseSchema.parse(raw));
    const id = newId("gst");
    await db.insert(schema.companyExpenses).values({ id, date: d.date, person: d.person, kind: d.kind, description: d.description, amountEur: d.amount, createdBy: user.id });
    await audit(user, { action: "expense.create", entityType: "expense", entityId: id, summary: `Lançou ${eur(d.amount)} em Gastos: ${d.person} — ${EXPENSE_KINDS[d.kind].toLowerCase()}${d.description ? ` (${d.description})` : ""}` });
    revalidatePath("/painel/gastos");
  }, "Lançamento guardado.");
}

export async function updateExpense(id: string, raw: ExpenseInput): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("expenses.manage");
    const d = clean(expenseSchema.parse(raw));
    const [before] = await db.select().from(schema.companyExpenses).where(eq(schema.companyExpenses.id, id)).limit(1);
    if (!before) throw new UserError("Lançamento não encontrado.");
    await db
      .update(schema.companyExpenses)
      .set({ date: d.date, person: d.person, kind: d.kind, description: d.description, amountEur: d.amount, updatedAt: new Date() })
      .where(eq(schema.companyExpenses.id, id));
    await audit(user, { action: "expense.update", entityType: "expense", entityId: id, summary: `Corrigiu um lançamento em Gastos: ${before.person} ${eur(before.amountEur)} → ${d.person} ${eur(d.amount)}` });
    revalidatePath("/painel/gastos");
  }, "Lançamento corrigido.");
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertPermission("expenses.manage");
    const [e] = await db.select().from(schema.companyExpenses).where(eq(schema.companyExpenses.id, id)).limit(1);
    if (!e) throw new UserError("Lançamento não encontrado.");
    await db.delete(schema.companyExpenses).where(eq(schema.companyExpenses.id, id));
    await audit(user, { action: "expense.delete", entityType: "expense", entityId: id, summary: `Apagou um lançamento em Gastos: ${e.person} — ${eur(e.amountEur)}${e.description ? ` (${e.description})` : ""}` });
    revalidatePath("/painel/gastos");
  }, "Lançamento apagado.");
}
