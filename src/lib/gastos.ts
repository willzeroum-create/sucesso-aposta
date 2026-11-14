/** Aba Gastos: tipos de lançamento e cálculo do saldo de cada pessoa com a empresa (partilhado cliente/servidor). */

export const COMPANY = "Empresa";

export const EXPENSE_KINDS = {
  gasto: "Gastou da conta da empresa",
  pagamento: "Devolveu / pagou à empresa",
  adiantamento: "Pagou do próprio bolso pela empresa",
} as const;
export type ExpenseKind = keyof typeof EXPENSE_KINDS;

export interface ExpenseRow {
  id: string;
  date: string;
  person: string;
  kind: ExpenseKind;
  description: string;
  amountEur: number;
}

export const isCompany = (person: string) => person.trim().toLocaleLowerCase("pt-PT") === COMPANY.toLocaleLowerCase("pt-PT");

/** Nome normalizado para agrupar ("tonico " e "Tonico" são a mesma pessoa). */
export const personKey = (person: string) => person.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-PT");

/**
 * Efeito no saldo da pessoa com a empresa. Negativo = a pessoa deve à empresa; positivo = a empresa deve à pessoa.
 * Lançamentos da própria empresa (água, luz…) não mexem em saldos pessoais.
 */
export function balanceEffect(e: Pick<ExpenseRow, "person" | "kind" | "amountEur">): number {
  if (isCompany(e.person)) return 0;
  return e.kind === "gasto" ? -e.amountEur : e.amountEur;
}

/** Quanto saiu da conta da empresa (gastos lançados, de pessoas ou da própria empresa). */
export const leftCompanyAccount = (e: Pick<ExpenseRow, "kind" | "amountEur">) => (e.kind === "gasto" ? e.amountEur : 0);

export interface PersonBalance {
  name: string;
  spent: number;
  paid: number;
  balance: number;
  count: number;
}

export function balancesByPerson(rows: ExpenseRow[]): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  for (const r of rows) {
    if (isCompany(r.person)) continue;
    const key = personKey(r.person);
    const b = map.get(key) ?? { name: r.person.trim().replace(/\s+/g, " "), spent: 0, paid: 0, balance: 0, count: 0 };
    if (r.kind === "gasto") b.spent += r.amountEur;
    else b.paid += r.amountEur;
    b.balance += balanceEffect(r);
    b.count++;
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name, "pt-PT"));
}
