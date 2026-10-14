"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { createCustomer, updateCustomer } from "@/app/painel/_actions/customers";
import { isValidNif } from "@/lib/pt-validation";
import { AiReader, type FieldMeta } from "./ai-reader";
import { Alert, Field, Spinner, useAction } from "./ui";

const AI_FIELDS: FieldMeta[] = [
  { key: "fullName", label: "Nome" },
  { key: "nif", label: "NIF" },
  { key: "idDocumentType", label: "Tipo de documento" },
  { key: "idDocumentNumber", label: "Nº do documento" },
  { key: "idDocumentExpiry", label: "Validade" },
  { key: "idDocumentIssuer", label: "Emitido por" },
  { key: "birthDate", label: "Nascimento" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "address", label: "Morada" },
  { key: "postalCode", label: "Código postal" },
  { key: "city", label: "Localidade" },
  { key: "country", label: "País" },
  { key: "drivingLicenseNumber", label: "Carta de condução" },
];

const ID_TYPES = ["Cartão de Cidadão", "Título de Residência", "Passaporte", "Bilhete de Identidade", "Outro"];

export function CustomerForm({ id, initial }: { id?: string; initial: Record<string, string> }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [attach, setAttach] = useState<string[]>([]);
  const { pending, fields: errors, run } = useAction();
  const dirty = useMemo(() => Object.keys({ ...values, ...initial }).some((k) => (values[k] ?? "") !== (initial[k] ?? "")), [values, initial]);
  const nifWarning = values.nif && values.nif.replace(/\D/g, "").length === 9 && !isValidNif(values.nif);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setSuggested((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (id) {
      const res = await run(() => updateCustomer(id, form));
      if (res.ok) {
        setSuggested(new Set());
        router.refresh();
      }
    } else {
      const res = await run(() => createCustomer(form, attach));
      if (res.ok) router.push(`/painel/clientes/${res.data.id}`);
    }
  }

  const f = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide?: boolean, hint?: string) => (
    <Field label={label} name={name} error={errors[name]} wide={wide} hint={hint} suggested={suggested.has(name)}>
      <input id={`f-${name}`} name={name} value={values[name] ?? ""} onChange={set(name)} aria-invalid={Boolean(errors[name])} {...props} />
    </Field>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <AiReader
        mode="person"
        target={id ? { ownerType: "customer", ownerId: id, kind: "identificacao" } : { ownerType: "none", kind: "identificacao" }}
        fields={AI_FIELDS}
        current={values}
        onApply={(found) => {
          setValues((v) => ({ ...v, ...found }));
          setSuggested((s) => new Set([...s, ...Object.keys(found)]));
        }}
        onUploaded={(ids) => setAttach((a) => [...a, ...ids])}
        intro="Fotografe a frente e o verso do Cartão de Cidadão ou título de residência, e um comprovativo de morada se o documento não a tiver."
      />
      <form className="a-card a-card-body a-form" onSubmit={submit} noValidate>
        {!id && attach.length > 0 && <Alert kind="info">{attach.length} documento(s) serão guardados na ficha ao criar o cliente.</Alert>}
        <fieldset className="a-fieldset">
          <legend>Identificação</legend>
          <div className="a-fields">
            {f("fullName", "Nome completo *", { required: true, autoComplete: "off" }, true)}
            <Field label="NIF" name="nif" error={errors.nif ?? (nifWarning ? "Este NIF não passa na validação." : undefined)} suggested={suggested.has("nif")}>
              <input id="f-nif" name="nif" value={values.nif ?? ""} onChange={set("nif")} inputMode="numeric" maxLength={11} aria-invalid={Boolean(errors.nif || nifWarning)} />
            </Field>
            <Field label="Tipo de documento" name="idDocumentType" suggested={suggested.has("idDocumentType")}>
              <input id="f-idDocumentType" name="idDocumentType" list="id-types" value={values.idDocumentType ?? ""} onChange={set("idDocumentType")} />
              <datalist id="id-types">
                {ID_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            {f("idDocumentNumber", "Nº do documento")}
            {f("idDocumentExpiry", "Validade", { type: "date" })}
            {f("idDocumentIssuer", "Emitido por")}
            {f("birthDate", "Data de nascimento", { type: "date" })}
            {f("nationality", "Nacionalidade")}
            {f("drivingLicenseNumber", "Nº da carta de condução")}
          </div>
        </fieldset>
        <fieldset className="a-fieldset">
          <legend>Contactos e morada</legend>
          <div className="a-fields">
            {f("phone", "Telefone", { type: "tel", autoComplete: "off" })}
            {f("email", "E-mail", { type: "email", autoComplete: "off" })}
            {f("address", "Morada", {}, true)}
            {f("postalCode", "Código postal", { placeholder: "0000-000" })}
            {f("city", "Localidade")}
            {f("country", "País")}
          </div>
        </fieldset>
        <fieldset className="a-fieldset">
          <legend>Notas</legend>
          <div className="a-fields">
            {f("source", "Origem", { placeholder: "ex.: Site, Standvirtual, recomendação" })}
            <Field label="Notas internas" name="notes" wide>
              <textarea id="f-notes" name="notes" value={values.notes ?? ""} onChange={set("notes")} rows={3} maxLength={4000} />
            </Field>
          </div>
        </fieldset>
        <div className="a-form-foot">
          <button className="a-btn a-btn-primary" disabled={pending || (!!id && !dirty)}>
            {pending ? <Spinner /> : <Save size={16} />} {id ? "Guardar alterações" : "Criar ficha de cliente"}
          </button>
          {suggested.size > 0 && <span className="muted" style={{ fontSize: 13 }}>Confirme os campos a azul com o documento.</span>}
        </div>
      </form>
    </div>
  );
}
