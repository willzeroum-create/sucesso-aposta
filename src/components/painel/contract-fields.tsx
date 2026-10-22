"use client";

import { withDerived, type ContractField } from "@/lib/contract-fields";

const WIDE = /morada$|^venda\.observacoes$|^viatura\.modelo$|extenso$|^consignacao\.iban$|^aluguer\.(forma_pagamento|estado_geral)$|^garantia\.complementos$/;

/** Passo "Dados do documento": todos os campos que vão para os documentos, por grupo, editáveis. */
export function ContractFields({
  fields,
  edited,
  onEdit,
  errors,
}: {
  fields: ContractField[];
  edited: Record<string, string>;
  onEdit: (patch: Record<string, string>) => void;
  errors: Record<string, string | undefined>;
}) {
  const valueOf = (f: ContractField) => edited[f.key] ?? f.value;
  return (
    <>
      {[...new Set(fields.map((f) => f.group))].map((group) => (
        <fieldset key={group} className="a-fieldset">
          <legend>{group}</legend>
          <div className="a-fields">
            {fields
              .filter((f) => f.group === group)
              .map((f) => {
                const v = valueOf(f);
                const empty = f.required && !v.trim();
                return (
                  <div key={f.key} className={`a-field${WIDE.test(f.key) ? " wide" : ""}`}>
                    <label htmlFor={`c-${f.key}`}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </label>
                    <input
                      id={`c-${f.key}`}
                      value={v}
                      aria-invalid={empty || Boolean(errors[f.key])}
                      onChange={(e) => onEdit(withDerived(f.key, e.target.value))}
                      placeholder={/data|validade|nascimento|primeira/.test(f.key) && !/extenso/.test(f.key) ? "dd/mm/aaaa" : ""}
                    />
                    {errors[f.key] ? <span className="a-error">{errors[f.key]}</span> : empty ? <span className="a-error">Por preencher</span> : null}
                  </div>
                );
              })}
          </div>
        </fieldset>
      ))}
    </>
  );
}
