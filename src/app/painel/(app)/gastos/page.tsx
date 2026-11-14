import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { ExpensesBoard } from "@/components/painel/expenses";
import type { ExpenseRow } from "@/lib/gastos";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Gastos" };

export default async function ExpensesPage() {
  await requirePagePermission("expenses.manage");
  const rows: ExpenseRow[] = await db
    .select({
      id: schema.companyExpenses.id,
      date: schema.companyExpenses.date,
      person: schema.companyExpenses.person,
      kind: schema.companyExpenses.kind,
      description: schema.companyExpenses.description,
      amountEur: schema.companyExpenses.amountEur,
    })
    .from(schema.companyExpenses)
    .orderBy(desc(schema.companyExpenses.date), desc(schema.companyExpenses.createdAt));

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Gastos</h1>
          <p>Quem gastou o quê da conta da empresa, quem devolveu e quanto cada pessoa ainda deve. O saldo atualiza sozinho.</p>
        </div>
      </div>
      <ExpensesBoard rows={rows} />
    </div>
  );
}
