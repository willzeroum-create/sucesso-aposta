"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { addExpense, deleteExpense, updateExpense } from "@/app/painel/_actions/gastos";
import { balanceEffect, balancesByPerson, COMPANY, EXPENSE_KINDS, isCompany, leftCompanyAccount, personKey, type ExpenseKind, type ExpenseRow } from "@/lib/gastos";
import { Field, Spinner, useAction } from "./ui";

const eur = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
const parseMoney = (v: string) => Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
const today = () => new Date().toISOString().slice(0, 10);
const datePt = (iso: string) => iso.split("-").reverse().join("/");
const monthLabel = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

type Draft = { date: string; person: string; kind: ExpenseKind; description: string; amount: string };
const empty = (): Draft => ({ date: today(), person: "", kind: "gasto", description: "", amount: "" });

/** Saldo em palavras: quem deve a quem. */
function balanceText(b: number) {
  if (Math.abs(b) < 0.005) return "Contas certas";
  return b < 0 ? `Deve ${eur(-b)} à empresa` : `A empresa deve-lhe ${eur(b)}`;
}

/**
 * Gastos da empresa: lançar quem gastou/pagou, em quê e quanto; o saldo de cada pessoa atualiza sozinho.
 * Ex.: Tonico gastou 1000 € da conta da empresa (−1000) e depois devolveu 800 € (+800) → deve 200 €.
 */
export function ExpensesBoard({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [month, setMonth] = useState("todos");
  const [person, setPerson] = useState("todos");

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (!isCompany(r.person)) seen.set(personKey(r.person), r.person.trim());
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-PT"));
  }, [rows]);
  const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(), [rows]);
  const balances = useMemo(() => balancesByPerson(rows), [rows]);

  const visible = rows.filter(
    (r) =>
      (month === "todos" || r.date.startsWith(month)) &&
      (person === "todos" || (person === COMPANY ? isCompany(r.person) : personKey(r.person) === personKey(person))),
  );
  const totals = visible.reduce(
    (t, r) => ({
      out: t.out + leftCompanyAccount(r),
      company: t.company + (isCompany(r.person) && r.kind === "gasto" ? r.amountEur : 0) + (r.kind === "adiantamento" ? r.amountEur : 0),
      back: t.back + (r.kind === "pagamento" ? r.amountEur : 0),
    }),
    { out: 0, company: 0, back: 0 },
  );
  const owed = balances.reduce((s, b) => s + (b.balance < 0 ? -b.balance : 0), 0);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const forCompany = isCompany(draft.person);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const input = { date: draft.date, person: draft.person, kind: forCompany ? "gasto" : draft.kind, description: draft.description, amount: draft.amount.trim() ? parseMoney(draft.amount) : NaN };
    const res = await run(() => (editing ? updateExpense(editing, input) : addExpense(input)));
    if (res.ok) {
      setDraft((d) => ({ ...empty(), date: d.date }));
      setEditing(null);
      router.refresh();
    }
  }

  function edit(r: ExpenseRow) {
    setEditing(r.id);
    setDraft({ date: r.date, person: r.person, kind: r.kind, description: r.description, amount: String(r.amountEur).replace(".", ",") });
    document.getElementById("gastos-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(r: ExpenseRow) {
    if (!confirm(`Apagar o lançamento de ${eur(r.amountEur)} de ${r.person}?`)) return;
    if ((await run(() => deleteExpense(r.id))).ok) router.refresh();
  }

  return (
    <div className="a-gastos">
      <div className="a-stats is-money">
        <div className="a-stat">
          <span>Saiu da conta da empresa</span>
          <strong className="is-bad">{eur(totals.out)}</strong>
          <small>{month === "todos" ? "desde o início" : monthLabel(month)}</small>
        </div>
        <div className="a-stat">
          <span>Despesas da empresa</span>
          <strong>{eur(totals.company)}</strong>
          <small>contas, água, luz…</small>
        </div>
        <div className="a-stat">
          <span>Devolvido à empresa</span>
          <strong className="is-good">{eur(totals.back)}</strong>
        </div>
        <div className="a-stat">
          <span>Pessoas a dever</span>
          <strong className={owed > 0 ? "is-bad" : ""}>{eur(owed)}</strong>
          <small>total em aberto</small>
        </div>
      </div>

      <div className="a-halves">
        <div className="a-halves-col">
          <form id="gastos-form" className="a-card a-card-pad" onSubmit={save} style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{editing ? "Corrigir lançamento" : "Novo lançamento"}</h2>
              {editing && (
                <button type="button" className="a-btn a-btn-sm" onClick={() => (setEditing(null), setDraft(empty()))}>
                  <X size={14} /> Cancelar
                </button>
              )}
            </div>
            <div className="a-fields">
              <Field label="Quem" name="g-person" error={errors.person} hint={`Nome da pessoa, ou "${COMPANY}" para contas da empresa.`}>
                <input id="f-g-person" list="g-people" value={draft.person} onChange={(e) => set("person", e.target.value)} placeholder="Ex.: Tonico" autoComplete="off" required maxLength={80} />
                <datalist id="g-people">
                  <option value={COMPANY} />
                  {people.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              <Field label="O que aconteceu" name="g-kind" error={errors.kind}>
                {forCompany ? (
                  <input id="f-g-kind" value="A empresa pagou" readOnly />
                ) : (
                  <select id="f-g-kind" value={draft.kind} onChange={(e) => set("kind", e.target.value as ExpenseKind)}>
                    {(Object.keys(EXPENSE_KINDS) as ExpenseKind[]).map((k) => (
                      <option key={k} value={k}>
                        {EXPENSE_KINDS[k]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Valor (€)" name="g-amount" error={errors.amount}>
                <input id="f-g-amount" inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" required aria-invalid={Boolean(errors.amount)} />
              </Field>
              <Field label="Data" name="g-date" error={errors.date}>
                <input id="f-g-date" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} required />
              </Field>
              <Field label="Descrição" name="g-desc" wide error={errors.description}>
                <input id="f-g-desc" value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Ex.: água e luz, gasóleo, peças…" maxLength={300} />
              </Field>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="a-btn a-btn-primary" disabled={pending}>
                {pending ? <Spinner size={14} /> : editing ? <Pencil size={15} /> : <Plus size={16} />}
                {editing ? "Guardar correção" : "Lançar"}
              </button>
            </div>
          </form>

          <section className="a-card">
            <div className="a-card-head">
              <h2>Saldo de cada pessoa</h2>
            </div>
            {balances.length ? (
              <div className="a-docs">
                {balances.map((b) => (
                  <button key={b.name} type="button" className="a-doc a-doc-pay a-gastos-person" onClick={() => setPerson(person === b.name ? "todos" : b.name)} aria-pressed={personKey(person) === personKey(b.name)}>
                    <span style={{ minWidth: 0, display: "grid", gap: 3, textAlign: "left" }}>
                      <strong>{b.name}</strong>
                      <small>
                        Gastou {eur(b.spent)} · devolveu/pagou {eur(b.paid)}
                      </small>
                    </span>
                    <strong className={`num ${b.balance < -0.005 ? "is-bad" : b.balance > 0.005 ? "is-good" : ""}`}>{balanceText(b.balance)}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ padding: "12px 20px", margin: 0, fontSize: 14 }}>
                Ainda ninguém tem gastos lançados.
              </p>
            )}
          </section>
        </div>

        <section className="a-card" style={{ minWidth: 0 }}>
          <div className="a-card-head" style={{ flexWrap: "wrap", gap: 8 }}>
            <h2>Lançamentos</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="a-input a-input-sm" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filtrar por pessoa">
                <option value="todos">Todas as pessoas</option>
                <option value={COMPANY}>{COMPANY}</option>
                {people.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select className="a-input a-input-sm" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Filtrar por mês">
                <option value="todos">Todos os meses</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {visible.length ? (
            <div className="a-docs">
              {visible.map((r) => {
                const effect = balanceEffect(r);
                return (
                  <div key={r.id} className={`a-doc a-doc-pay${editing === r.id ? " is-editing" : ""}`}>
                    <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                      <strong>
                        {r.person} <span className="muted" style={{ fontWeight: 400 }}>· {isCompany(r.person) ? "a empresa pagou" : EXPENSE_KINDS[r.kind].toLowerCase()}</span>
                      </strong>
                      <small>
                        {datePt(r.date)}
                        {r.description ? ` — ${r.description}` : ""}
                      </small>
                      <strong className={`num ${r.kind === "gasto" ? "is-bad" : "is-good"}`}>
                        {r.kind === "gasto" ? "−" : "+"}
                        {eur(r.amountEur)}
                        {effect !== 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> no saldo de {r.person}</span>}
                      </strong>
                    </span>
                    <span className="a-row-actions">
                      <button type="button" className="a-btn a-btn-sm" onClick={() => edit(r)} aria-label={`Corrigir lançamento de ${r.person}`}>
                        <Pencil size={14} /> Corrigir
                      </button>
                      <button type="button" className="a-btn a-btn-sm" onClick={() => remove(r)} disabled={pending} aria-label={`Apagar lançamento de ${r.person}`}>
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted" style={{ padding: "12px 20px", margin: 0, fontSize: 14 }}>
              {rows.length ? "Nada neste filtro." : "Ainda não há lançamentos. Use o formulário para lançar o primeiro."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
