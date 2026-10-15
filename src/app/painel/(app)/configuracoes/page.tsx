import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { SimpleSettingsForm, TemplateEditor } from "@/components/painel/settings-forms";
import { Alert } from "@/components/painel/ui";
import { aiModelLabel } from "@/server/ai/provider";
import { vindecoderConfigured } from "@/server/vin";
import { requirePagePermission } from "@/server/auth/session";
import { getTemplateFiles, getTemplates } from "@/server/forms";
import { getCompanyInfo, getPrivacySettings } from "@/server/settings";
import { storageDriver } from "@/server/storage";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requirePagePermission("site.edit");
  const company = await getCompanyInfo("sale");
  const companyRent = await getCompanyInfo("rent");
  const privacy = await getPrivacySettings();
  const templates = await getTemplates();
  const wordFiles = await getTemplateFiles();
  const [custom] = await db.select().from(schema.settings).where(eq(schema.settings.key, "templates")).limit(1);
  const customized = new Set(Object.keys((custom?.value ?? {}) as object));
  const ai = aiModelLabel();
  const integrations = [
    { name: "Base de dados", ok: true, detail: `PostgreSQL${process.env.DATABASE_URL?.includes("supabase") ? " (Supabase)" : ""}` },
    { name: "Armazenamento de ficheiros", ok: true, detail: { supabase: "Supabase Storage (privado)", blob: "Vercel Blob (privado)", local: "Disco local (./data/uploads)" }[storageDriver()] },
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
            <h2>Empresa de vendas</h2>
            <p>Emitente do termo de garantia e da declaração de circulação.</p>
          </div>
        </div>
        <div className="a-card-body">
          <SimpleSettingsForm kind="company" initial={company as unknown as Record<string, string>} inputs={[
              { name: "legalName", label: "Denominação social", wide: true },
              { name: "nipc", label: "NIF / NIPC" },
              { name: "phone", label: "Telefone" },
              { name: "email", label: "E-mail" },
              { name: "address", label: "Morada (rua)", wide: true },
              { name: "postalCode", label: "Código postal" },
              { name: "city", label: "Localidade" },
              { name: "instagram", label: "Instagram" },
              { name: "representativeName", label: "Representante legal" },
              { name: "representativeRole", label: "Cargo" },
              { name: "licenseNumber", label: "Alvará / licença (opcional)" },
            ]} />
        </div>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Empresa de aluguer</h2>
            <p>Emitente do contrato de locação.</p>
          </div>
        </div>
        <div className="a-card-body">
          <SimpleSettingsForm kind="company_rent" initial={companyRent as unknown as Record<string, string>} inputs={[
              { name: "legalName", label: "Denominação social", wide: true },
              { name: "nipc", label: "NIF / NIPC" },
              { name: "phone", label: "Telefone" },
              { name: "email", label: "E-mail" },
              { name: "address", label: "Morada (rua)", wide: true },
              { name: "postalCode", label: "Código postal" },
              { name: "city", label: "Localidade" },
              { name: "instagram", label: "Instagram" },
              { name: "representativeName", label: "Representante legal" },
              { name: "representativeRole", label: "Cargo" },
              { name: "licenseNumber", label: "Alvará / licença (opcional)" },
            ]} />
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
          Carregue o contrato e o termo reais do stand em Word: cada venda gera uma cópia já preenchida com o comprador e a viatura. Os exemplos incluídos servem só para testar e devem ser substituídos pelos documentos revistos pelo vosso jurista.
        </Alert>
        {Object.values(templates).map((t) => (
          <TemplateEditor
            key={t.id}
            id={t.id}
            title={t.title}
            body={t.body}
            customized={customized.has(t.id)}
            word={wordFiles[t.id] ? { name: wordFiles[t.id]!.name, uploadedAt: wordFiles[t.id]!.uploadedAt, uploadedBy: wordFiles[t.id]!.uploadedBy, fields: wordFiles[t.id]!.fields } : null}
            hasExample={["termo_garantia", "declaracao_circulacao", "contrato_locacao"].includes(t.id)}
            open={["termo_garantia", "declaracao_circulacao", "contrato_locacao"].includes(t.id)}
          />
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
