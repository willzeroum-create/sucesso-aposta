"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, FileSignature, Trash2 } from "lucide-react";
import { deleteGeneratedForm, generateForm, previewForm } from "@/app/painel/_actions/forms";
import { PLACEHOLDERS, type TemplateId } from "@/lib/form-templates";
import { dateTime } from "@/lib/labels";
import { Alert, Spinner, useAction } from "./ui";

type Option = { id: string; label: string };
type TemplateInfo = { id: TemplateId; title: string; description: string; needsCustomer: boolean; needsVehicle: boolean };
export type GeneratedRow = { id: string; title: string; who: string; createdAt: string; fileId: string | null; by: string };

const placeholderLabel = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.label]));

export function FormGenerator({
  templates,
  customers,
  vehicles,
  fixedVehicleId,
  fixedCustomerId,
  defaultCustomerId,
  defaultPrice,
  defaultKm,
  history,
}: {
  templates: TemplateInfo[];
  customers: Option[];
  vehicles: Option[];
  fixedVehicleId?: string;
  fixedCustomerId?: string;
  defaultCustomerId?: string | null;
  defaultPrice?: number | null;
  defaultKm?: number | null;
  history: GeneratedRow[];
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const available = templates.filter((t) => (fixedCustomerId ? true : true) && (!fixedCustomerId || !t.needsVehicle || vehicles.length > 0));
  const [template, setTemplate] = useState<TemplateId>(available[0]?.id ?? "termo_garantia");
  const [customerId, setCustomerId] = useState(fixedCustomerId ?? defaultCustomerId ?? "");
  const [vehicleId, setVehicleId] = useState(fixedVehicleId ?? "");
  const now = new Date();
  const [sale, setSale] = useState({
    priceEur: defaultPrice != null ? String(defaultPrice) : "",
    date: now.toISOString().slice(0, 10),
    time: now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" }),
    place: "",
    deliveryKm: defaultKm != null ? String(defaultKm) : "",
    notes: "",
  });
  const [missing, setMissing] = useState<string[] | null>(null);
  const t = templates.find((x) => x.id === template)!;

  const input = () => ({
    template,
    customerId: t.needsCustomer ? customerId || null : customerId || null,
    vehicleId: t.needsVehicle ? vehicleId || null : null,
    sale: {
      priceEur: sale.priceEur ? Number(sale.priceEur.replace(/\s/g, "").replace(",", ".")) : null,
      date: sale.date,
      time: sale.time,
      place: sale.place,
      deliveryKm: sale.deliveryKm ? Number(sale.deliveryKm.replace(/\D/g, "")) : null,
      notes: sale.notes,
    },
  });

  async function check() {
    const res = await run(() => previewForm(input()), { quiet: true });
    if (res.ok) setMissing(res.data.missing);
  }

  async function generate() {
    const res = await run(() => generateForm(input()));
    if (res.ok) {
      window.open(res.data.url, "_blank", "noopener");
      setMissing(null);
      router.refresh();
    }
  }

  const setS = (k: keyof typeof sale) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (setSale((s) => ({ ...s, [k]: e.target.value })), setMissing(null));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <FileSignature size={17} /> Gerar termo ou ficha
            </h2>
            <p>Preenchido com os dados do stand, do cliente e da viatura. Revise o PDF antes de imprimir e assinar.</p>
          </div>
        </div>
        <div className="a-card-body a-form" style={{ gap: 16 }}>
          <div className="a-fields">
            <div className="a-field wide">
              <label htmlFor="tpl">Documento</label>
              <select id="tpl" value={template} onChange={(e) => (setTemplate(e.target.value as TemplateId), setMissing(null))}>
                {available.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
              <span className="a-hint">{t.description}</span>
            </div>
            {!fixedCustomerId && t.needsCustomer && (
              <div className="a-field">
                <label htmlFor="tpl-customer">Cliente</label>
                <select id="tpl-customer" value={customerId} onChange={(e) => (setCustomerId(e.target.value), setMissing(null))}>
                  <option value="">— Escolher —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!fixedVehicleId && t.needsVehicle && (
              <div className="a-field">
                <label htmlFor="tpl-vehicle">Viatura</label>
                <select id="tpl-vehicle" value={vehicleId} onChange={(e) => (setVehicleId(e.target.value), setMissing(null))}>
                  <option value="">— Escolher —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {t.id !== "ficha_cliente" && (
            <div className="a-fields">
              <div className="a-field">
                <label htmlFor="s-price">Preço (€)</label>
                <input id="s-price" inputMode="decimal" value={sale.priceEur} onChange={setS("priceEur")} />
              </div>
              <div className="a-field">
                <label htmlFor="s-date">Data</label>
                <input id="s-date" type="date" value={sale.date} onChange={setS("date")} />
              </div>
              <div className="a-field">
                <label htmlFor="s-time">Hora</label>
                <input id="s-time" type="time" value={sale.time} onChange={setS("time")} />
              </div>
              <div className="a-field">
                <label htmlFor="s-km">Km na entrega</label>
                <input id="s-km" inputMode="numeric" value={sale.deliveryKm} onChange={setS("deliveryKm")} />
              </div>
              <div className="a-field">
                <label htmlFor="s-place">Localidade</label>
                <input id="s-place" value={sale.place} onChange={setS("place")} placeholder="Por omissão, a do stand" />
              </div>
              <div className="a-field wide">
                <label htmlFor="s-notes">Observações</label>
                <textarea id="s-notes" rows={2} value={sale.notes} onChange={setS("notes")} maxLength={2000} placeholder="ex.: Garantia de 18 meses. Entregue com 2 chaves e livro de revisões." />
              </div>
            </div>
          )}
          {missing && missing.length > 0 && (
            <Alert kind="warn" title="Campos que vão ficar em branco no documento">
              <p>{missing.map((k) => placeholderLabel[k] ?? k).join(", ")}.</p>
              <p className="muted" style={{ fontSize: 13 }}>
                Complete a ficha do cliente, a viatura ou os dados da empresa (Configurações) — ou gere assim e preencha à mão.
              </p>
            </Alert>
          )}
          {missing && missing.length === 0 && <Alert kind="ok">Todos os campos estão preenchidos.</Alert>}
          <div className="a-actions">
            <button type="button" className="a-btn" onClick={check} disabled={pending}>
              Verificar dados
            </button>
            <button type="button" className="a-btn a-btn-primary" onClick={generate} disabled={pending}>
              {pending ? <Spinner /> : <FileDown size={16} />} Gerar PDF
            </button>
          </div>
        </div>
      </section>

      <GeneratedHistory history={history} />
    </div>
  );
}

/** Lista dos documentos gerados, com abrir e apagar (Declarações, Termos da viatura). */
export function GeneratedHistory({ history, title = "Documentos gerados" }: { history: GeneratedRow[]; title?: string }) {
  const router = useRouter();
  const { run } = useAction();
  if (!history.length) return null;
  return (
    <section className="a-card">
      <div className="a-card-head">
        <h2>{title}</h2>
      </div>
      <table className="a-table">
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td>
                <strong style={{ fontWeight: 600 }}>{h.title}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {h.who}
                </div>
              </td>
              <td className="hide-sm muted" style={{ fontSize: 13 }}>
                {h.by} · {dateTime(h.createdAt)}
              </td>
              <td className="right" style={{ whiteSpace: "nowrap" }}>
                {h.fileId && (
                  <a className="a-btn a-btn-sm" href={`/api/admin/files/${h.fileId}`} target="_blank" rel="noopener">
                    Abrir
                  </a>
                )}{" "}
                <button
                  type="button"
                  className="a-icon-btn"
                  aria-label={`Apagar ${h.title}`}
                  title="Apagar documento"
                  onClick={async () => {
                    if (!window.confirm(`Apagar “${h.title}”? Não dá para desfazer.`)) return;
                    if ((await run(() => deleteGeneratedForm(h.id))).ok) router.refresh();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
