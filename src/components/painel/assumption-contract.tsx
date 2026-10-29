"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Download, FileText, Trash2 } from "lucide-react";
import { generateAssumptionContract } from "@/app/painel/_actions/assuncao";
import { deleteGeneratedForm } from "@/app/painel/_actions/forms";
import type { AssuncaoInput, Outorgante } from "@/lib/assuncao";
import { Dialog, Field, Spinner, useAction } from "./ui";

type Kind = "rent" | "sale";
type Stand = Outorgante & { label: string; city: string };
type Generated = { id: string; fileId: string | null; createdAt: string; by: string };

const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
const parse = (v: string) => (v.trim() ? Number(v.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) : null);
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
const strip = ({ label: _l, city: _c, ...o }: Stand): Outorgante => o;

/**
 * Contrato de assunção de responsabilidade de uma venda a prestações: tudo vem preenchido da cobrança
 * e do stand; a pessoa revê e gera o PDF para imprimir e assinar.
 */
export function AssumptionContract({
  chargeId,
  defaults,
  stands,
  generated,
  autoOpen = false,
  canDelete = false,
}: {
  chargeId: string;
  defaults: AssuncaoInput;
  stands: Record<Kind, Stand>;
  generated: Generated[];
  autoOpen?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [open, setOpen] = useState(autoOpen);
  const [company, setCompany] = useState<Kind>("rent");
  const [standSide, setStandSide] = useState<"primeiro" | "segundo">("primeiro");
  const [form, setForm] = useState(() => ({
    ...defaults,
    prestacao: num(defaults.prestacao),
    numPrestacoes: num(defaults.numPrestacoes),
    divida: num(defaults.divida),
    iuc: num(defaults.iuc),
    penal: num(defaults.penal),
  }));

  useEffect(() => {
    // Veio de "Registar venda a prestações" com o contrato marcado: tira o ?contrato=1 do endereço.
    if (autoOpen) router.replace(`/painel/cobrancas/${chargeId}`, { scroll: false });
  }, [autoOpen, chargeId, router]);

  type Text = Exclude<keyof typeof form, "primeiro" | "segundo">;
  const set = (k: Text) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setParty = (side: "primeiro" | "segundo", k: keyof Outorgante, v: string | boolean) => setForm((f) => ({ ...f, [side]: { ...f[side], [k]: v } }));

  function pickCompany(kind: Kind) {
    setCompany(kind);
    setForm((f) => ({ ...f, [standSide]: strip(stands[kind]), local: f.local === stands[company].city ? stands[kind].city : f.local }));
  }
  function swap() {
    setStandSide((s) => (s === "primeiro" ? "segundo" : "primeiro"));
    setForm((f) => ({ ...f, primeiro: f.segundo, segundo: f.primeiro }));
  }

  async function generate() {
    const res = await run(() =>
      generateAssumptionContract(chargeId, {
        ...form,
        company,
        standSide,
        prestacao: parse(form.prestacao),
        numPrestacoes: parse(form.numPrestacoes),
        divida: parse(form.divida),
        iuc: parse(form.iuc),
        penal: parse(form.penal),
      }),
    );
    if (res.ok) {
      setOpen(false);
      const a = document.createElement("a");
      a.href = res.data.url;
      a.download = res.data.name;
      a.click();
      router.refresh();
    }
  }

  const bank = form.entidade.trim();
  const partyFields = (side: "primeiro" | "segundo") => {
    const o = form[side];
    const e = (k: string) => errors[`${side}.${k}`];
    return (
      <>
        <div className="a-field wide">
          <div className="a-seg" role="group" aria-label="Tipo">
            <button type="button" aria-pressed={!o.empresa} onClick={() => setParty(side, "empresa", false)}>
              Particular
            </button>
            <button type="button" aria-pressed={o.empresa} onClick={() => setParty(side, "empresa", true)}>
              Empresa
            </button>
          </div>
        </div>
        <Field label={o.empresa ? "Empresa *" : "Nome *"} name={`as-${side}-nome`} error={e("nome")} wide>
          <input id={`f-as-${side}-nome`} value={o.nome} onChange={(ev) => setParty(side, "nome", ev.target.value)} />
        </Field>
        <Field label={o.empresa ? "NIPC" : "NIF"} name={`as-${side}-nif`} error={e("nif")}>
          <input id={`f-as-${side}-nif`} inputMode="numeric" value={o.nif} onChange={(ev) => setParty(side, "nif", ev.target.value)} />
        </Field>
        <Field label={o.empresa ? "Sede" : "Morada"} name={`as-${side}-morada`} error={e("morada")} wide>
          <input id={`f-as-${side}-morada`} value={o.morada} onChange={(ev) => setParty(side, "morada", ev.target.value)} />
        </Field>
        {o.empresa && (
          <>
            <Field label="Representado por" name={`as-${side}-rep`} error={e("representante")} hint={side === standSide ? "Fica guardado para o próximo contrato." : undefined}>
              <input id={`f-as-${side}-rep`} value={o.representante} onChange={(ev) => setParty(side, "representante", ev.target.value)} />
            </Field>
            <Field label="NIF do representante" name={`as-${side}-repnif`} error={e("representanteNif")}>
              <input id={`f-as-${side}-repnif`} inputMode="numeric" value={o.representanteNif} onChange={(ev) => setParty(side, "representanteNif", ev.target.value)} />
            </Field>
          </>
        )}
      </>
    );
  };

  return (
    <section className="a-card">
      <div className="a-card-head">
        <div>
          <h2>Contrato de assunção de responsabilidade</h2>
          <p>Minuta do advogado (18 cláusulas e pacto de livrança), preenchida com os dados desta venda. Gera um PDF para imprimir e assinar com reconhecimento presencial.</p>
        </div>
        <button type="button" className="a-btn a-btn-primary a-btn-sm" onClick={() => setOpen(true)}>
          <FileText size={15} /> {generated.length ? "Gerar outra vez" : "Gerar contrato"}
        </button>
      </div>
      {generated.length > 0 && (
        <ul className="a-assume-list">
          {generated.map((g) => (
            <li key={g.id}>
              <FileText size={16} aria-hidden />
              <span>
                <strong>{when(g.createdAt)}</strong>
                <small className="muted">PDF · {g.by}</small>
              </span>
              {g.fileId && (
                <a className="a-btn a-btn-sm" href={`/api/admin/files/${g.fileId}`} download>
                  <Download size={14} /> Descarregar
                </a>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="a-icon-btn"
                  aria-label="Apagar este contrato gerado"
                  disabled={pending}
                  onClick={async () => confirm("Apagar este contrato gerado?") && (await run(() => deleteGeneratedForm(g.id))).ok && router.refresh()}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Rever o contrato antes de gerar"
        wide
        footer={
          <>
            <button type="button" className="a-btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="button" className="a-btn a-btn-primary" onClick={generate} disabled={pending}>
              {pending ? <Spinner size={14} /> : <Download size={15} />} Gerar PDF
            </button>
          </>
        }
      >
        <div className="a-assume-form">
          <Field label="Empresa do stand" name="as-company" wide hint="A da minuta do advogado é a Aposta Promissora.">
            <select id="f-as-company" className="a-input" value={company} onChange={(e) => pickCompany(e.target.value as Kind)}>
              <option value="rent">{stands.rent.label}</option>
              <option value="sale">{stands.sale.label}</option>
            </select>
          </Field>

          <fieldset className="a-assume-party">
            <legend>Primeiro Outorgante <span className="muted">— recebe as prestações</span></legend>
            <div className="a-fields">{partyFields("primeiro")}</div>
          </fieldset>
          <div className="a-assume-swap">
            <button type="button" className="a-btn a-btn-sm" onClick={swap}>
              <ArrowUpDown size={14} /> Trocar outorgantes
            </button>
            <span className="muted">Use quando é o stand que paga as prestações a outra pessoa.</span>
          </div>
          <fieldset className="a-assume-party">
            <legend>Segundo Outorgante <span className="muted">— paga as prestações</span></legend>
            <div className="a-fields">{partyFields("segundo")}</div>
          </fieldset>

          <fieldset className="a-assume-party">
            <legend>Viatura e pagamento</legend>
            <div className="a-fields">
              <Field label="Viatura *" name="as-viatura" error={errors.viatura} hint="Como aparece no contrato. Ex.: BMW 330d E93 Pack M">
                <input id="f-as-viatura" value={form.viatura} onChange={set("viatura")} />
              </Field>
              <Field label="Matrícula" name="as-matricula" error={errors.matricula}>
                <input id="f-as-matricula" value={form.matricula} onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value.toUpperCase() }))} placeholder="AA-00-BB" />
              </Field>
              <Field label="Financiamento junto de" name="as-entidade" error={errors.entidade} hint={bank ? "Texto da minuta: financiamento num banco ou financeira." : "Vazio = é o próprio stand que financia."} wide>
                <input id="f-as-entidade" value={form.entidade} onChange={set("entidade")} placeholder="Ex.: Bi-Credit (deixe vazio se o stand financia)" />
              </Field>
              <Field label="Prestação mensal (€) *" name="as-prestacao" error={errors.prestacao}>
                <input id="f-as-prestacao" inputMode="decimal" value={form.prestacao} onChange={set("prestacao")} />
              </Field>
              {!bank && (
                <>
                  <Field label="Nº de prestações" name="as-num" error={errors.numPrestacoes}>
                    <input id="f-as-num" inputMode="numeric" value={form.numPrestacoes} onChange={set("numPrestacoes")} />
                  </Field>
                  <Field label="Valor em dívida (€)" name="as-divida" error={errors.divida}>
                    <input id="f-as-divida" inputMode="decimal" value={form.divida} onChange={set("divida")} />
                  </Field>
                  <Field label="1.ª prestação" name="as-primeira" error={errors.primeiraData}>
                    <input id="f-as-primeira" type="date" value={form.primeiraData} onChange={set("primeiraData")} />
                  </Field>
                </>
              )}
              <Field label="IUC (€)" name="as-iuc" error={errors.iuc} hint="Opcional. Ex.: 717">
                <input id="f-as-iuc" inputMode="decimal" value={form.iuc} onChange={set("iuc")} />
              </Field>
              <Field label="Cláusula penal por mês de atraso (€)" name="as-penal" error={errors.penal}>
                <input id="f-as-penal" inputMode="decimal" value={form.penal} onChange={set("penal")} />
              </Field>
            </div>
          </fieldset>

          <fieldset className="a-assume-party">
            <legend>Avalista e assinatura</legend>
            <div className="a-fields">
              <Field label="Avalista / fiador (opcional)" name="as-avalista" error={errors.avalista} hint="Vem do 2.º titular / fiador da venda. Vazio = sem avalista.">
                <input id="f-as-avalista" value={form.avalista} onChange={set("avalista")} />
              </Field>
              <Field label="NIF do avalista" name="as-avalista-nif" error={errors.avalistaNif}>
                <input id="f-as-avalista-nif" inputMode="numeric" value={form.avalistaNif} onChange={set("avalistaNif")} />
              </Field>
              <Field label="Morada do avalista" name="as-avalista-morada" error={errors.avalistaMorada} wide>
                <input id="f-as-avalista-morada" value={form.avalistaMorada} onChange={set("avalistaMorada")} />
              </Field>
              <Field label="Local" name="as-local" error={errors.local}>
                <input id="f-as-local" value={form.local} onChange={set("local")} />
              </Field>
              <Field label="Data *" name="as-data" error={errors.data}>
                <input id="f-as-data" type="date" value={form.data} onChange={set("data")} />
              </Field>
            </div>
          </fieldset>
        </div>
      </Dialog>
    </section>
  );
}
