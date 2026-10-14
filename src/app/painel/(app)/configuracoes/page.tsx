import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { SimpleSettingsForm, TemplateEditor } from "@/components/painel/settings-forms";
import { Alert } from "@/components/painel/ui";
import { aiModelLabel } from "@/server/ai/provider";
import { vindecoderConfigured } from "@/server/vin";
import { requirePagePermission } from "@/server/auth/session";
import { getTemplates } from "@/server/forms";
import { getCompanyInfo, getPrivacySettings } from "@/server/settings";
import { storageDriver } from "@/server/storage";
import { databaseConfig } from "@/db/config";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requirePagePermission("site.edit");
  const company = await getCompanyInfo();
  const privacy = await getPrivacySettings();
  const templates = await getTemplates();
  const [custom] = await db.select().from(schema.settings).where(eq(schema.settings.key, "templates")).limit(1);
  const customized = new Set(Object.keys((custom?.value ?? {}) as object));
  const ai = aiModelLabel();
  const db_ = databaseConfig();
  const integrations = [
    { name: "Base de dados", ok: true, detail: db_.remote ? "Remota (Turso/libSQL)" : "Ficheiro local (./data/app.db)" },
    { name: "Armazenamento de ficheiros", ok: true, detail: storageDriver() === "blob" ? "Vercel Blob (privado)" : "Disco local (./data/uploads)" },
    { name: "Leitura de documentos com IA", ok: Boolean(ai), detail: ai ?? "Defina GEMINI_API_KEY ou ANTHROPIC_API_KEY" },
    { name: "Pesquisa por VIN", ok: true, detail: vindecoderConfigured() ? "vindecoder.eu + NHTSA" : "NHTSA (gratuito). Para fichas europeias completas, VINDECODER_EU_API_KEY e _SECRET" },
    { name: "Meta Ads", ok: Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), detail: "META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID" },
    { name: "Google Ads", ok: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN), detail: "GOOGLE_ADS_* (developer token, OAuth, ID do cliente)" },
    { name: "Catálogo do site", ok: process.env.CATALOG_MODE === "database", detail: `CATALOG_MODE=${process.env.CATALOG_MODE ?? "demo"}` },
  ];

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Configurações</h1>
          <p>Dados da empresa para os termos, privacidade dos pedidos de contacto e modelos de documentos.</p>
        </div>
      </div>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Empresa (vendedor nos termos)</h2>
            <p>Usado em contratos, termos e declarações. Não aparece no site.</p>
          </div>
        </div>
        <div className="a-card-body">
          <SimpleSettingsForm
            kind="company"
            initial={company as unknown as Record<string, string>}
            inputs={[
              { name: "legalName", label: "Denominação social", wide: true, hint: "ex.: Sucesso Aposta, Lda." },
              { name: "nipc", label: "NIPC" },
              { name: "licenseNumber", label: "Alvará / licença (opcional)" },
              { name: "address", label: "Sede", wide: true },
              { name: "postalCode", label: "Código postal" },
              { name: "city", label: "Localidade" },
              { name: "representativeName", label: "Representante legal" },
              { name: "representativeRole", label: "Cargo" },
            ]}
          />
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Privacidade dos pedidos</h2>
            <p>O texto do consentimento é guardado com cada pedido, como prova.</p>
          </div>
        </div>
        <div className="a-card-body">
          <SimpleSettingsForm
            kind="privacy"
            initial={{ ...privacy, leadRetentionMonths: String(privacy.leadRetentionMonths) }}
            inputs={[
              { name: "consentText", label: "Texto do consentimento", wide: true, type: "textarea" },
              { name: "policyUrl", label: "Endereço da política de privacidade", hint: "Obrigatório antes de ativar o formulário real." },
              { name: "leadRetentionMonths", label: "Guardar pedidos não convertidos (meses)", type: "number" },
            ]}
          />
        </div>
      </section>

      <div style={{ display: "grid", gap: 10 }}>
        <h2 className="a-section-title">Modelos de documentos</h2>
        <Alert kind="info">
          Pode colar aqui o texto do termo que o stand já usa, mantendo os campos entre chavetas. Os textos-base são uma proposta: confirme-os com o vosso contabilista ou jurista antes de usar.
        </Alert>
        {Object.values(templates).map((t) => (
          <TemplateEditor key={t.id} id={t.id} title={t.title} body={t.body} customized={customized.has(t.id)} />
        ))}
      </div>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Integrações</h2>
            <p>Configuradas por variáveis de ambiente no servidor (nunca no navegador).</p>
          </div>
        </div>
        <div className="a-table-wrap">
        <table className="a-table">
          <tbody>
            {integrations.map((i) => (
              <tr key={i.name}>
                <td style={{ fontWeight: 600 }}>{i.name}</td>
                <td className="muted" style={{ fontSize: 13 }}>
                  {i.detail}
                </td>
                <td className="right">
                  <span className={`a-pill ${i.ok ? "available" : "neutral"}`}>{i.ok ? "Ativo" : "Por ligar"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  );
}
