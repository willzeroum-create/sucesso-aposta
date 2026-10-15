import Link from "next/link";
import { and, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { clampDays, getGoogleReport, getMetaReport, type AdsReport } from "@/server/ads";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Anúncios" };

const money = (v: number, currency: string) => new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(v);
const n = new Intl.NumberFormat("pt-PT");

function Report({ title, report, setup }: { title: string; report: AdsReport; setup: string }) {
  if (report.status === "off")
    return (
      <section className="a-card">
        <div className="a-card-head">
          <h2>{title}</h2>
          <span className="a-pill neutral">Por ligar</span>
        </div>
        <div className="a-card-body" style={{ display: "grid", gap: 10 }}>
          <p>{setup}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            Variáveis em falta no servidor: {report.missing.map((m) => <span key={m} className="a-code" style={{ marginRight: 4 }}>{m}</span>)}
          </p>
        </div>
      </section>
    );
  if (report.status === "error")
    return (
      <section className="a-card">
        <div className="a-card-head">
          <h2>{title}</h2>
          <span className="a-pill danger">Erro</span>
        </div>
        <div className="a-card-body">
          <p>Não foi possível obter os dados: {report.error}</p>
        </div>
      </section>
    );
  const { totals, currency, daily, campaigns } = report;
  const max = Math.max(1, ...daily.map((d) => d.spend));
  return (
    <section className="a-card">
      <div className="a-card-head">
        <h2>{title}</h2>
        <span className="a-pill available">Ligado</span>
      </div>
      <div className="a-stats" style={{ border: 0, borderBottom: "1px solid var(--line)", borderRadius: 0 }}>
        <div className="a-stat">
          <span>Investimento</span>
          <strong>{money(totals.spend, currency)}</strong>
        </div>
        <div className="a-stat">
          <span>Cliques</span>
          <strong>{n.format(totals.clicks)}</strong>
          <small>CTR {totals.ctr.toFixed(2)}%</small>
        </div>
        <div className="a-stat">
          <span>Custo por clique</span>
          <strong>{money(totals.cpc, currency)}</strong>
        </div>
        <div className="a-stat">
          <span>Contactos / conversões</span>
          <strong>{n.format(Math.round(totals.conversions))}</strong>
          <small>{totals.conversions ? `${money(totals.spend / totals.conversions, currency)} cada` : "—"}</small>
        </div>
      </div>
      {daily.length > 1 && (
        <div className="a-card-body">
          <div className="a-bars" role="img" aria-label={`Investimento diário, máximo ${money(max, currency)}`}>
            {daily.map((d) => (
              <span key={d.date} style={{ height: `${Math.max(2, (d.spend / max) * 100)}%` }} title={`${d.date.split("-").reverse().join("/")}: ${money(d.spend, currency)} · ${d.clicks} cliques`} />
            ))}
          </div>
        </div>
      )}
      {campaigns.length > 0 && (
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th className="right">Investimento</th>
                <th className="right hide-sm">Impressões</th>
                <th className="right">Cliques</th>
                <th className="right hide-sm">CPC</th>
                <th className="right">Conversões</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.name}
                    {c.status && c.status !== "ENABLED" && <span className="a-pill neutral plain" style={{ marginLeft: 6 }}>{c.status === "PAUSED" ? "Em pausa" : c.status}</span>}
                  </td>
                  <td className="right num">{money(c.spend, currency)}</td>
                  <td className="right num hide-sm">{n.format(c.impressions)}</td>
                  <td className="right num">{n.format(c.clicks)}</td>
                  <td className="right num hide-sm">{money(c.cpc, currency)}</td>
                  <td className="right num">{n.format(Math.round(c.conversions))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdsPage(props: PageProps<"/painel/anuncios">) {
  await requirePagePermission("ads.view");
  const sp = await props.searchParams;
  const days = clampDays(Number(sp.dias) || 30);
  const [meta, google] = await Promise.all([getMetaReport(days), getGoogleReport(days)]);
  const since = new Date(Date.now() - days * 86_400_000);
  const leadsBySource = await db
    .select({ source: sql<string>`coalesce(${schema.leads.utmSource}, ${schema.leads.source})`, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, since)))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`);

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Anúncios</h1>
          <p>Resultados das campanhas Meta (Facebook e Instagram) e Google Ads. Apenas leitura; atualiza a cada 10 minutos.</p>
        </div>
        <nav className="a-funnel" aria-label="Período">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={`/painel/anuncios?dias=${d}`} aria-current={days === d ? "page" : undefined}>
              {d} dias
            </Link>
          ))}
        </nav>
      </div>

      <Report
        title="Meta — Facebook e Instagram"
        report={meta}
        setup="Ligue a conta de anúncios da Meta: crie um utilizador de sistema no Business Manager com acesso de leitura (ads_read) à conta de anúncios e guarde o token e o ID da conta nas variáveis do servidor."
      />
      <Report
        title="Google Ads"
        report={google}
        setup="Ligue a Google Ads API: é preciso um developer token (Centro de API da conta de gestor), um cliente OAuth do Google Cloud e um refresh token com acesso à conta. O ID do cliente é o número de 10 algarismos da conta."
      />

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Pedidos de contacto por origem</h2>
            <p>Últimos {days} dias. Use links com utm_source nos anúncios para os distinguir.</p>
          </div>
        </div>
        {leadsBySource.length ? (
          <table className="a-table">
            <tbody>
              {leadsBySource.map((r) => (
                <tr key={r.source}>
                  <td>{r.source}</td>
                  <td className="right num">{Number(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="a-empty">Ainda sem pedidos neste período.</div>
        )}
      </section>
    </div>
  );
}
