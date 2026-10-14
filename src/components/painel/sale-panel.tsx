"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, FileDown, Search, UserPlus, Users } from "lucide-react";
import { completeSale, reviewSale, type ContractField } from "@/app/painel/_actions/sales";
import { createCustomer } from "@/app/painel/_actions/customers";
import { isValidNif } from "@/lib/pt-validation";
import type { TemplateId } from "@/lib/form-templates";
import { AiReader, type FieldMeta } from "./ai-reader";
import { Alert, Field, Spinner, useAction } from "./ui";

type CustomerOption = { id: string; fullName: string; nif: string | null; label: string };
type DocOption = { id: TemplateId; title: string; description: string };

const NEW_FIELDS: FieldMeta[] = [
  { key: "fullName", label: "Nome", important: true },
  { key: "nif", label: "NIF", important: true },
  { key: "idDocumentType", label: "Tipo de documento" },
  { key: "idDocumentNumber", label: "Nº do documento", important: true },
  { key: "idDocumentExpiry", label: "Validade" },
  { key: "birthDate", label: "Nascimento" },
  { key: "nationality", label: "Nacionalidade" },
  { key: "address", label: "Morada", important: true },
  { key: "postalCode", label: "Código postal", important: true },
  { key: "city", label: "Localidade", important: true },
  { key: "country", label: "País" },
  { key: "drivingLicenseNumber", label: "Carta de condução" },
];

const DEFAULT_DOCS: TemplateId[] = ["contrato_compra_venda", "termo_responsabilidade"];

export function SalePanel({
  vehicleId,
  vehicleLabel,
  customers,
  documents,
  defaults,
  sold,
  canMarkSold,
  canCreateCustomer,
}: {
  vehicleId: string;
  vehicleLabel: string;
  customers: CustomerOption[];
  documents: DocOption[];
  defaults: { customerId: string | null; priceEur: number | null; km: number | null };
  sold: { buyer: string | null; date: string | null } | null;
  canMarkSold: boolean;
  canCreateCustomer: boolean;
}) {
  const router = useRouter();
  const { pending, fields: errors, run } = useAction();
  const [mode, setMode] = useState<"existing" | "new">(defaults.customerId || !canCreateCustomer ? "existing" : customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState(defaults.customerId ?? "");
  const [query, setQuery] = useState("");
  const [list, setList] = useState(customers);
  const [newC, setNewC] = useState<Record<string, string>>({ country: "Portugal" });
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [attach, setAttach] = useState<string[]>([]);
  const now = new Date();
  const [sale, setSale] = useState({
    priceEur: defaults.priceEur != null ? String(defaults.priceEur) : "",
    date: now.toISOString().slice(0, 10),
    time: now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }),
    km: defaults.km != null ? String(defaults.km) : "",
    place: "",
    notes: "",
  });
  const [docs, setDocs] = useState<Set<TemplateId>>(new Set(DEFAULT_DOCS.filter((d) => documents.some((x) => x.id === d))));
  const [markSold, setMarkSold] = useState(canMarkSold && !sold);
  const [done, setDone] = useState<{ title: string; url: string; format: "docx" | "pdf" }[] | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.label.toLowerCase().includes(q)) : list;
  }, [list, query]);
  const selected = list.find((c) => c.id === customerId);
  const nifWarn = newC.nif && newC.nif.replace(/\D/g, "").length === 9 && !isValidNif(newC.nif);

  const setNew = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewC((v) => ({ ...v, [k]: e.target.value }));
    setSuggested((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  };

  async function createNew() {
    const form = new FormData();
    for (const [k, v] of Object.entries(newC)) form.set(k, v);
    form.set("source", "Venda");
    const res = await run(() => createCustomer(form, attach));
    if (res.ok) {
      const c = { id: res.data.id, fullName: newC.fullName, nif: newC.nif || null, label: newC.nif ? `${newC.fullName} · NIF ${newC.nif.replace(/\D/g, "")}` : newC.fullName };
      setList((l) => [c, ...l]);
      setCustomerId(c.id);
      setMode("existing");
      setNewC({ country: "Portugal" });
      setSuggested(new Set());
      setAttach([]);
    }
  }

  // Passo 4: dados do contrato, revistos e completados antes de gerar.
  const [review, setReview] = useState<ContractField[] | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [saveToRecords, setSaveToRecords] = useState(true);
  const [saved, setSaved] = useState<string[]>([]);
  const saleKey = JSON.stringify([customerId, sale, [...docs].sort()]);
  // Qualquer alteração nos passos 1–3 obriga a rever de novo.
  useEffect(() => {
    setReview(null);
    setEdited({});
  }, [saleKey]);

  const baseInput = () => ({
    customerId,
    priceEur: Number(sale.priceEur.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0,
    date: sale.date,
    time: sale.time,
    deliveryKm: sale.km ? Number(sale.km.replace(/\D/g, "")) : null,
    place: sale.place,
    notes: sale.notes,
    documents: [...docs],
  });

  async function prepare() {
    const res = await run(() => reviewSale(vehicleId, baseInput()), { quiet: true });
    if (res.ok) {
      setReview(res.data.fields);
      setEdited({});
      requestAnimationFrame(() => document.getElementById("dados-contrato")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const valueOf = (f: ContractField) => edited[f.key] ?? f.value;
  const missing = review ? review.filter((f) => f.required && !valueOf(f).trim()) : [];

  async function submit() {
    if (!review) return;
    const res = await run(() => completeSale(vehicleId, { ...baseInput(), markSold, values: Object.fromEntries(review.map((f) => [f.key, valueOf(f)])), saveToRecords }));
    if (res.ok) {
      setSaved(res.data.saved);
      setDone(res.data.documents);
      router.refresh();
    }
  }

  const nf = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide?: boolean) => (
    <Field label={label} name={`new-${name}`} wide={wide} suggested={suggested.has(name)} error={errors[name] ?? (name === "nif" && nifWarn ? "Este NIF não passa na validação." : undefined)}>
      <input id={`f-new-${name}`} value={newC[name] ?? ""} onChange={setNew(name)} {...props} />
    </Field>
  );

  if (done)
    return (
      <section className="a-card a-card-pad" style={{ display: "grid", gap: 16 }}>
        <Alert kind="ok" title={markSold ? `${vehicleLabel} vendido a ${selected?.fullName ?? "cliente"}` : "Documentos gerados"}>
          <p>Abra, confira e imprima para assinar. Ficam guardados no separador Termos da viatura e na ficha do cliente.</p>
          {saved.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Os dados completados foram guardados em: {saved.join(", ")}.</p>}
        </Alert>
        <div className="a-actions">
          {done.map((d) => (
            <a key={d.url} className="a-btn a-btn-primary" href={d.url} target="_blank" rel="noopener">
              <FileDown size={16} /> {d.title} ({d.format === "docx" ? "Word" : "PDF"})
            </a>
          ))}
        </div>
        <div>
          <button type="button" className="a-btn a-btn-sm a-btn-ghost" onClick={() => setDone(null)}>
            Gerar novamente
          </button>
        </div>
      </section>
    );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {sold && (
        <Alert kind="info" title="Esta viatura já está vendida">
          <p>
            {sold.buyer ? `Comprador: ${sold.buyer}. ` : ""}
            {sold.date ? `Data: ${sold.date}. ` : ""}Pode voltar a gerar os documentos abaixo.
          </p>
        </Alert>
      )}

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>1. Comprador</h2>
            <p>Escolha um cliente da lista ou crie um novo a partir do documento de identificação.</p>
          </div>
          {canCreateCustomer && (
            <div className="a-tabs" role="tablist" style={{ border: 0 }}>
              <button type="button" role="tab" aria-selected={mode === "existing"} onClick={() => setMode("existing")}>
                <Users size={15} /> Cliente existente
              </button>
              <button type="button" role="tab" aria-selected={mode === "new"} onClick={() => setMode("new")}>
                <UserPlus size={15} /> Novo cliente
              </button>
            </div>
          )}
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 14 }}>
          {mode === "existing" ? (
            <>
              {selected && (
                <Alert kind="ok">
                  <p>
                    Comprador: <strong>{selected.fullName}</strong>
                    {selected.nif ? ` · NIF ${selected.nif}` : ""}
                  </p>
                </Alert>
              )}
              <div className="a-search" style={{ maxWidth: "none" }}>
                <Search size={16} aria-hidden="true" />
                <input className="a-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por nome ou NIF" aria-label="Procurar cliente" />
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }} role="listbox" aria-label="Clientes">
                {filtered.length ? (
                  filtered.slice(0, 200).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={c.id === customerId}
                      onClick={() => setCustomerId(c.id)}
                      style={{
                        display: "flex",
                        width: "100%",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "10px 12px",
                        border: 0,
                        borderBottom: "1px solid var(--line)",
                        background: c.id === customerId ? "var(--accent-soft)" : "transparent",
                        color: "inherit",
                        font: "inherit",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontWeight: c.id === customerId ? 650 : 500 }}>{c.fullName}</span>
                      <span className="muted num">{c.nif ? `NIF ${c.nif}` : ""}</span>
                    </button>
                  ))
                ) : (
                  <div className="a-empty">
                    <strong>Nenhum cliente encontrado.</strong>
                    {canCreateCustomer && (
                      <button type="button" className="a-btn a-btn-sm" onClick={() => setMode("new")}>
                        <UserPlus size={15} /> Criar novo cliente
                      </button>
                    )}
                  </div>
                )}
              </div>
              {errors.customerId && <span className="a-error" style={{ color: "var(--danger)", fontSize: 13 }}>{errors.customerId}</span>}
            </>
          ) : (
            <>
              <AiReader
                mode="person"
                target={{ ownerType: "none", kind: "identificacao" }}
                fields={NEW_FIELDS}
                current={newC}
                onApply={(found) => {
                  setNewC((v) => ({ ...v, ...found }));
                  setSuggested((s) => new Set([...s, ...Object.keys(found)]));
                }}
                onUploaded={(ids) => setAttach((a) => [...a, ...ids])}
                intro="Fotografe o Cartão de Cidadão (frente e verso) e, se precisar, um comprovativo de morada."
              />
              <div className="a-fields">
                {nf("fullName", "Nome completo *", { required: true }, true)}
                {nf("nif", "NIF", { inputMode: "numeric", maxLength: 11 })}
                {nf("idDocumentType", "Tipo de documento")}
                {nf("idDocumentNumber", "Nº do documento")}
                {nf("idDocumentExpiry", "Validade", { type: "date" })}
                {nf("address", "Morada", {}, true)}
                {nf("postalCode", "Código postal", { placeholder: "0000-000" })}
                {nf("city", "Localidade")}
                {nf("phone", "Telefone", { type: "tel" })}
                {nf("email", "E-mail", { type: "email" })}
              </div>
              <div className="a-actions">
                <button type="button" className="a-btn a-btn-primary" onClick={createNew} disabled={pending || !newC.fullName?.trim()}>
                  {pending ? <Spinner /> : <UserPlus size={16} />} Criar cliente e usar como comprador
                </button>
                {attach.length > 0 && <span className="muted" style={{ fontSize: 13 }}>{attach.length} documento(s) ficam na ficha do cliente.</span>}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>2. Dados da venda</h2>
            <p>Os dados da viatura já estão preenchidos a partir da ficha.</p>
          </div>
        </div>
        <div className="a-card-body a-fields">
          <Field label="Preço de venda (€) *" name="sale-price" error={errors.priceEur}>
            <input id="f-sale-price" inputMode="decimal" value={sale.priceEur} onChange={(e) => setSale((s) => ({ ...s, priceEur: e.target.value }))} />
          </Field>
          <Field label="Data da venda" name="sale-date" error={errors.date}>
            <input id="f-sale-date" type="date" value={sale.date} onChange={(e) => setSale((s) => ({ ...s, date: e.target.value }))} />
          </Field>
          <Field label="Hora da entrega" name="sale-time" error={errors.time}>
            <input id="f-sale-time" type="time" value={sale.time} onChange={(e) => setSale((s) => ({ ...s, time: e.target.value }))} />
          </Field>
          <Field label="Km na entrega" name="sale-km">
            <input id="f-sale-km" inputMode="numeric" value={sale.km} onChange={(e) => setSale((s) => ({ ...s, km: e.target.value }))} />
          </Field>
          <Field label="Localidade" name="sale-place" hint="Por omissão, a do stand.">
            <input id="f-sale-place" value={sale.place} onChange={(e) => setSale((s) => ({ ...s, place: e.target.value }))} />
          </Field>
          <Field label="Observações (garantia, chaves, extras…)" name="sale-notes" wide>
            <textarea id="f-sale-notes" rows={2} maxLength={2000} value={sale.notes} onChange={(e) => setSale((s) => ({ ...s, notes: e.target.value }))} placeholder="ex.: Garantia de 18 meses. Entregue com 2 chaves e livro de revisões." />
          </Field>
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>3. Documentos</h2>
            <p>Gerados já preenchidos com a viatura, o comprador e o stand. Os textos editam-se em Configurações → Modelos.</p>
          </div>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 10 }}>
          {documents.map((d) => (
            <label key={d.id} className="a-check">
              <input
                type="checkbox"
                checked={docs.has(d.id)}
                onChange={(e) => {
                  const next = new Set(docs);
                  if (e.target.checked) next.add(d.id);
                  else next.delete(d.id);
                  setDocs(next);
                }}
              />
              <span>
                <strong style={{ fontWeight: 600 }}>{d.title}</strong>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>
                  {d.description}
                </span>
              </span>
            </label>
          ))}
          {canMarkSold && (
            <label className="a-check" style={{ marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <input type="checkbox" checked={markSold} onChange={(e) => setMarkSold(e.target.checked)} />
              <span>
                <strong style={{ fontWeight: 600 }}>Marcar a viatura como vendida</strong>
                <span className="muted" style={{ display: "block", fontSize: 13 }}>
                  Associa o comprador, regista preço e data e, no site, passa a “Vendido”.
                </span>
              </span>
            </label>
          )}
        </div>
        <div className="a-form-foot" style={{ margin: 0 }}>
          <button type="button" className="a-btn a-btn-primary" onClick={prepare} disabled={pending || !customerId || !docs.size}>
            {pending && !review ? <Spinner /> : <ClipboardCheck size={16} />} Rever dados do contrato
          </button>
          {!customerId && <span className="muted" style={{ fontSize: 13 }}>Escolha ou crie o comprador primeiro.</span>}
        </div>
      </section>

      {review && (
        <section className="a-card" id="dados-contrato">
          <div className="a-card-head">
            <div>
              <h2>4. Dados do contrato</h2>
              <p>Tudo o que vai aparecer nos documentos. Confira, corrija e complete o que falta — só depois se gera.</p>
            </div>
            {missing.length > 0 ? <span className="a-pill danger">{missing.length} por preencher</span> : <span className="a-pill available">Completo</span>}
          </div>
          <div className="a-card-body" style={{ display: "grid", gap: 20 }}>
            {[...new Set(review.map((f) => f.group))].map((group) => (
              <fieldset key={group} className="a-fieldset">
                <legend>{group}</legend>
                <div className="a-fields">
                  {review
                    .filter((f) => f.group === group)
                    .map((f) => {
                      const v = valueOf(f);
                      const empty = f.required && !v.trim();
                      return (
                        <div key={f.key} className={`a-field${f.key.endsWith("morada") || f.key === "venda.observacoes" || f.key === "viatura.modelo" ? " wide" : ""}`}>
                          <label htmlFor={`c-${f.key}`}>
                            {f.label}
                            {f.required ? " *" : ""}
                          </label>
                          <input
                            id={`c-${f.key}`}
                            value={v}
                            aria-invalid={empty || Boolean(errors[f.key])}
                            onChange={(e) => setEdited((x) => ({ ...x, [f.key]: e.target.value }))}
                            placeholder={/data|validade|nascimento|primeira/.test(f.key) ? "dd/mm/aaaa" : ""}
                          />
                          {errors[f.key] ? <span className="a-error">{errors[f.key]}</span> : empty ? <span className="a-error">Por preencher</span> : null}
                        </div>
                      );
                    })}
                </div>
              </fieldset>
            ))}
            <label className="a-check">
              <input type="checkbox" checked={saveToRecords} onChange={(e) => setSaveToRecords(e.target.checked)} />
              <span>
                Guardar o que completar aqui na ficha do cliente, na viatura e nos dados do stand
                <span className="muted" style={{ display: "block", fontSize: 13 }}>Assim não é preciso voltar a escrever na próxima venda.</span>
              </span>
            </label>
          </div>
          <div className="a-form-foot" style={{ margin: 0 }}>
            <button type="button" className="a-btn a-btn-primary" onClick={submit} disabled={pending || missing.length > 0}>
              {pending ? <Spinner /> : <CheckCircle2 size={16} />} {markSold ? "Registar venda e gerar documentos" : "Gerar documentos"}
            </button>
            {missing.length > 0 && <span className="muted" style={{ fontSize: 13 }}>Falta preencher: {missing.map((f) => f.label).join(", ")}.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
