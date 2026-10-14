"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Save } from "lucide-react";
import { createVehicle, lookupDutchPlateAction, lookupVinAction, updateVehicle } from "@/app/painel/_actions/vehicles";
import { CATEGORY, FUEL, TRANSMISSION, int } from "@/lib/labels";
import { isValidVinFormat, normalizeVin } from "@/lib/pt-validation";
import { AiReader, type FieldMeta } from "./ai-reader";
import { Alert, Field, Spinner, useAction, useToast } from "./ui";

export type VehicleValues = Record<string, string>;

const AI_FIELDS: FieldMeta[] = [
  { key: "make", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "version", label: "Versão" },
  { key: "year", label: "Ano" },
  { key: "plate", label: "Matrícula" },
  { key: "vin", label: "VIN" },
  { key: "firstRegistration", label: "1.ª matrícula" },
  { key: "registrationDate", label: "Matrícula PT" },
  { key: "registrationOwner", label: "Titular registado" },
  { key: "mileageKm", label: "Quilómetros", format: (v) => int.format(Number(v)) },
  { key: "fuel", label: "Combustível", format: (v) => FUEL[v as keyof typeof FUEL] ?? String(v) },
  { key: "transmission", label: "Caixa", format: (v) => TRANSMISSION[v as keyof typeof TRANSMISSION] ?? String(v) },
  { key: "category", label: "Carroçaria", format: (v) => CATEGORY[v as keyof typeof CATEGORY] ?? String(v) },
  { key: "powerHp", label: "Potência (cv)" },
  { key: "engineCc", label: "Cilindrada (cm³)" },
  { key: "color", label: "Cor" },
  { key: "doors", label: "Portas" },
  { key: "seats", label: "Lugares" },
  { key: "grossWeightKg", label: "Peso bruto (kg)" },
  { key: "tareKg", label: "Tara (kg)" },
  { key: "co2", label: "CO₂ (g/km)" },
  { key: "vehicleType", label: "Tipo" },
  { key: "homologation", label: "Homologação" },
  { key: "nextInspection", label: "Próxima inspeção" },
  { key: "purchasePriceEur", label: "Preço de compra" },
  { key: "purchaseDate", label: "Data de compra" },
  { key: "supplier", label: "Fornecedor / vendedor" },
];

export function VehicleForm({ id, initial, canCosts }: { id?: string; initial: VehicleValues; canCosts: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<VehicleValues>(initial);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [attach, setAttach] = useState<string[]>([]);
  const [vinBusy, setVinBusy] = useState(false);
  const [nlPlate, setNlPlate] = useState("");
  const { pending, fields: errors, run } = useAction();
  const dirty = useMemo(() => Object.keys(values).some((k) => (values[k] ?? "") !== (initial[k] ?? "")), [values, initial]);
  const aiFields = canCosts ? AI_FIELDS : AI_FIELDS.filter((f) => !["purchasePriceEur", "purchaseDate", "supplier"].includes(f.key));

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (suggested.has(k)) setSuggested((s) => new Set([...s].filter((x) => x !== k)));
  };

  function apply(found: Record<string, string>, onlyEmpty: boolean) {
    const applied: string[] = [];
    setValues((v) => {
      const next = { ...v };
      for (const [k, val] of Object.entries(found)) {
        if (val === undefined || val === null || val === "") continue;
        if (onlyEmpty && next[k]) continue;
        next[k] = String(val);
        applied.push(k);
      }
      return next;
    });
    setSuggested((s) => new Set([...s, ...applied]));
    return applied.length;
  }

  async function lookupVin() {
    const vin = normalizeVin(values.vin);
    if (!isValidVinFormat(vin)) {
      toast("danger", "O VIN tem de ter 17 caracteres (sem I, O ou Q).");
      return;
    }
    setVinBusy(true);
    const res = await run(() => lookupVinAction(vin), { quiet: true });
    setVinBusy(false);
    if (!res.ok) return;
    const r = res.data;
    const found = Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, String(v)]));
    const n = apply(found, true);
    const sources = r.sources.filter((s) => s.ok).map((s) => s.name);
    toast(
      n ? "ok" : "info",
      n
        ? `${n} campo(s) preenchido(s) a partir do VIN (${sources.join(", ") || "identificação do fabricante"}). Confirme os valores destacados.`
        : `VIN válido${r.manufacturer ? ` — ${r.manufacturer}${r.country ? `, ${r.country}` : ""}` : ""}. Sem dados novos para preencher.`,
    );
  }

  async function lookupNl() {
    const res = await run(() => lookupDutchPlateAction(nlPlate), { quiet: true });
    if (!res.ok) return;
    const n = apply(Object.fromEntries(Object.entries(res.data).map(([k, v]) => [k, String(v)])), true);
    toast(n ? "ok" : "info", n ? `${n} campo(s) preenchido(s) pelo registo holandês (RDW).` : "Sem dados novos no RDW.");
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (id) {
      const res = await run(() => updateVehicle(id, form));
      if (res.ok) {
        setSuggested(new Set());
        router.refresh();
      }
    } else {
      const res = await run(() => createVehicle(form, attach));
      if (res.ok) router.push(`/painel/viaturas/${res.data.id}`);
    }
  }

  const f = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string, wide?: boolean) => (
    <Field label={label} name={name} error={errors[name]} hint={hint} wide={wide} suggested={suggested.has(name)}>
      <input id={`f-${name}`} name={name} value={values[name] ?? ""} onChange={set(name)} aria-invalid={Boolean(errors[name])} {...props} />
    </Field>
  );
  const sel = (name: string, label: string, options: Record<string, string>, empty?: string) => (
    <Field label={label} name={name} error={errors[name]} suggested={suggested.has(name)}>
      <select id={`f-${name}`} name={name} value={values[name] ?? ""} onChange={set(name)}>
        {empty !== undefined && <option value="">{empty}</option>}
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <AiReader
        mode="vehicle"
        target={id ? { ownerType: "vehicle", ownerId: id, kind: "outro" } : { ownerType: "none", kind: "outro" }}
        fields={aiFields}
        current={values}
        onApply={(v) => apply(v, false)}
        onUploaded={(ids) => setAttach((a) => [...a, ...ids])}
        intro={
          id
            ? "Fotografe o DUA, livrete estrangeiro, CoC ou fatura. Os ficheiros ficam nos documentos da viatura."
            : "Comece por fotografar o DUA ou o livrete: a IA propõe os dados e os documentos ficam anexados à viatura."
        }
      />

      <form className="a-card a-card-body a-form" onSubmit={submit} noValidate>
        {!id && attach.length > 0 && <Alert kind="info">{attach.length} documento(s) serão anexados a esta viatura ao guardar.</Alert>}
        <fieldset className="a-fieldset">
          <legend>Identificação</legend>
          <div className="a-fields">
            {f("make", "Marca *", { required: true, autoComplete: "off" })}
            {f("model", "Modelo *", { required: true, autoComplete: "off" })}
            {f("version", "Versão", { placeholder: "ex.: 320d M Sport" })}
            {sel("category", "Carroçaria", CATEGORY)}
            {f("plate", "Matrícula", { placeholder: "AA-00-AA", autoCapitalize: "characters" })}
            <Field label="Nº de quadro (VIN)" name="vin" error={errors.vin} suggested={suggested.has("vin")} hint="17 caracteres. Pesquise para preencher as características.">
              <div style={{ display: "flex", gap: 6 }}>
                <input id="f-vin" name="vin" value={values.vin ?? ""} onChange={set("vin")} maxLength={20} autoCapitalize="characters" style={{ fontVariantNumeric: "tabular-nums" }} />
                <button type="button" className="a-btn" onClick={lookupVin} disabled={vinBusy} aria-label="Pesquisar características pelo VIN" title="Pesquisar pelo VIN">
                  {vinBusy ? <Spinner /> : <Search size={16} />}
                </button>
              </div>
            </Field>
            {f("year", "Ano", { inputMode: "numeric", maxLength: 4 })}
            {f("firstRegistration", "Data da 1.ª matrícula", { type: "date" })}
          </div>
          <details>
            <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>
              Importada dos Países Baixos? Preencher pela matrícula holandesa (RDW)
            </summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8, maxWidth: 360 }}>
              <input className="a-input" value={nlPlate} onChange={(e) => setNlPlate(e.target.value)} placeholder="ex.: TL-429-X" aria-label="Matrícula holandesa" />
              <button type="button" className="a-btn" onClick={lookupNl} disabled={!nlPlate.trim() || pending}>
                Pesquisar
              </button>
            </div>
          </details>
        </fieldset>

        <fieldset className="a-fieldset">
          <legend>Características</legend>
          <div className="a-fields">
            {f("mileageKm", "Quilómetros", { inputMode: "numeric" })}
            {sel("fuel", "Combustível", FUEL, "—")}
            {sel("transmission", "Caixa", TRANSMISSION, "—")}
            {f("powerHp", "Potência (cv)", { inputMode: "numeric" })}
            {f("engineCc", "Cilindrada (cm³)", { inputMode: "numeric" })}
            {f("color", "Cor")}
            {f("doors", "Portas", { inputMode: "numeric" })}
            {f("seats", "Lugares", { inputMode: "numeric" })}
          </div>
        </fieldset>

        <fieldset className="a-fieldset">
          <legend>No site</legend>
          <p>O que os clientes veem quando a viatura estiver publicada.</p>
          <div className="a-fields">
            {f("priceEur", "Preço de venda (€)", { inputMode: "decimal" })}
            {f("highlight", "Frase de destaque", { maxLength: 120, placeholder: "ex.: Um só dono, revisões na marca" })}
            <Field label="Descrição" name="description" error={errors.description} wide>
              <textarea id="f-description" name="description" value={values.description ?? ""} onChange={set("description")} maxLength={4000} rows={4} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="a-fieldset">
          <legend>Registo e dados técnicos</legend>
          <div className="a-fields">
            {f("registrationDate", "Matrícula em Portugal", { type: "date" })}
            {f("registrationOwner", "Titular registado")}
            {f("vehicleType", "Tipo / categoria")}
            {f("homologation", "Homologação")}
            {f("grossWeightKg", "Peso bruto (kg)", { inputMode: "numeric" })}
            {f("tareKg", "Tara (kg)", { inputMode: "numeric" })}
            {f("co2", "CO₂ (g/km)", { inputMode: "numeric" })}
            {f("nextInspection", "Próxima inspeção", { type: "date" })}
          </div>
        </fieldset>

        <fieldset className="a-fieldset">
          <legend>Interno</legend>
          <p>Nunca aparece no site.</p>
          <div className="a-fields">
            {canCosts && f("purchasePriceEur", "Preço de compra (€)", { inputMode: "decimal" })}
            {canCosts && f("purchaseDate", "Data de compra", { type: "date" })}
            {canCosts && f("supplier", "Fornecedor / vendedor")}
            <Field label="Notas internas" name="internalNotes" error={errors.internalNotes} wide>
              <textarea id="f-internalNotes" name="internalNotes" value={values.internalNotes ?? ""} onChange={set("internalNotes")} rows={3} maxLength={4000} placeholder="Reparações, chaves, observações da preparação…" />
            </Field>
          </div>
        </fieldset>

        <div className="a-form-foot">
          <button className="a-btn a-btn-primary" disabled={pending || (!!id && !dirty)}>
            {pending ? <Spinner /> : <Save size={16} />} {id ? "Guardar alterações" : "Criar viatura"}
          </button>
          {id && dirty && (
            <button type="button" className="a-btn a-btn-ghost" onClick={() => (setValues(initial), setSuggested(new Set()))}>
              Desfazer
            </button>
          )}
          {suggested.size > 0 && <span className="muted" style={{ fontSize: 13 }}>Campos a azul foram preenchidos automaticamente — confirme antes de guardar.</span>}
        </div>
      </form>
    </div>
  );
}
