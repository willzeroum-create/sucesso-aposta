/**
 * Leitura das campanhas Meta (Facebook/Instagram) e Google Ads — só leitura, no servidor.
 * Meta: portado do projeto "faz tudo" (Marketing API /insights), já usado em produção.
 * Google: Google Ads API REST (googleAds:searchStream) com OAuth refresh token.
 * Sem credenciais, cada painel mostra o estado "por ligar" com o que falta configurar.
 */
import "server-only";

export interface AdsTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
}
export interface AdsCampaign extends AdsTotals {
  id: string;
  name: string;
  status?: string;
}
export interface AdsDaily {
  date: string;
  spend: number;
  clicks: number;
}
export type AdsReport =
  | { status: "off"; missing: string[] }
  | { status: "error"; error: string }
  | { status: "ok"; currency: string; totals: AdsTotals; campaigns: AdsCampaign[]; daily: AdsDaily[] };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function finish(totals: AdsTotals): AdsTotals {
  return {
    ...totals,
    ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
  };
}

export function clampDays(days: number): 7 | 30 | 90 {
  return days <= 7 ? 7 : days <= 30 ? 30 : 90;
}

/* ─────────── Meta ─────────── */

interface RawInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  actions?: { action_type: string; value: string }[];
}

const LEAD_ACTIONS = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "onsite_conversion.messaging_conversation_started_7d"];

function metaTotals(row: RawInsight): AdsTotals {
  return finish({
    spend: num(row.spend),
    impressions: num(row.impressions),
    clicks: num(row.clicks),
    ctr: 0,
    cpc: 0,
    conversions: row.actions?.filter((a) => LEAD_ACTIONS.includes(a.action_type)).reduce((s, a) => s + num(a.value), 0) ?? 0,
  });
}

function metaUrl(path: string, params: Record<string, string>) {
  const version = process.env.META_GRAPH_VERSION || "v23.0";
  const qs = new URLSearchParams({ ...params, access_token: process.env.META_ADS_ACCESS_TOKEN! });
  return `https://graph.facebook.com/${version}/${path}?${qs}`;
}

async function metaFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Meta respondeu ${res.status}`);
  return json;
}

async function metaAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let url: string | undefined = metaUrl(path, params);
  for (let page = 0; url; page++) {
    if (page >= 20) throw new Error("Relatório demasiado extenso; reduza o período.");
    const res: { data: T[]; paging?: { next?: string } } = await metaFetch(url);
    out.push(...res.data);
    const next = res.paging?.next;
    url = next && new URL(next).hostname === "graph.facebook.com" ? next : undefined;
  }
  return out;
}

export async function getMetaReport(days: number): Promise<AdsReport> {
  const missing = ["META_ADS_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"].filter((k) => !process.env[k]);
  if (missing.length) return { status: "off", missing };
  const account = `act_${process.env.META_AD_ACCOUNT_ID!.replace(/^act_/, "")}`;
  const date_preset = { 7: "last_7d", 30: "last_30d", 90: "last_90d" }[clampDays(days)];
  const fields = "spend,impressions,clicks,actions";
  try {
    const [info, total, daily, campaigns] = await Promise.all([
      metaFetch<{ currency?: string }>(metaUrl(account, { fields: "currency" })),
      metaFetch<{ data: RawInsight[] }>(metaUrl(`${account}/insights`, { fields, date_preset })),
      metaAll<RawInsight>(`${account}/insights`, { fields: "spend,clicks", date_preset, time_increment: "1", limit: "100" }),
      metaAll<RawInsight>(`${account}/insights`, { fields: `campaign_id,campaign_name,${fields}`, date_preset, level: "campaign", limit: "100" }),
    ]);
    return {
      status: "ok",
      currency: info.currency ?? "EUR",
      totals: metaTotals(total.data[0] ?? {}),
      daily: daily.map((d) => ({ date: d.date_start ?? "", spend: num(d.spend), clicks: num(d.clicks) })),
      campaigns: campaigns
        .map((c) => ({ id: c.campaign_id ?? "", name: c.campaign_name ?? "Campanha", ...metaTotals(c) }))
        .sort((a, b) => b.spend - a.spend),
    };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Erro ao ligar à Meta." };
  }
}

/* ─────────── Google Ads ─────────── */

const GOOGLE_VARS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
];

let cachedToken: { value: string; expires: number } | null = null;

async function googleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`OAuth Google: ${json.error_description ?? res.status}`);
  cachedToken = { value: json.access_token, expires: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

type GoogleRow = {
  campaign?: { id?: string; name?: string; status?: string };
  segments?: { date?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
  customer?: { currencyCode?: string };
};

async function googleQuery(query: string): Promise<GoogleRow[]> {
  const version = process.env.GOOGLE_ADS_API_VERSION || "v25";
  const customer = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/\D/g, "");
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
  const res = await fetch(`https://googleads.googleapis.com/${version}/customers/${customer}/googleAds:searchStream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      ...(login ? { "login-customer-id": login } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { results?: GoogleRow[] }[] | { error?: { message?: string } } | null;
  if (!res.ok || !Array.isArray(json)) {
    const message = json && !Array.isArray(json) ? json.error?.message : undefined;
    throw new Error(`Google Ads: ${message ?? `HTTP ${res.status}`}`);
  }
  return json.flatMap((chunk) => chunk.results ?? []);
}

function googleTotals(rows: GoogleRow[]): AdsTotals {
  return finish(
    rows.reduce<AdsTotals>(
      (t, r) => ({
        spend: t.spend + num(r.metrics?.costMicros) / 1_000_000,
        impressions: t.impressions + num(r.metrics?.impressions),
        clicks: t.clicks + num(r.metrics?.clicks),
        ctr: 0,
        cpc: 0,
        conversions: t.conversions + num(r.metrics?.conversions),
      }),
      { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, conversions: 0 },
    ),
  );
}

export async function getGoogleReport(days: number): Promise<AdsReport> {
  const missing = GOOGLE_VARS.filter((k) => !process.env[k]);
  if (missing.length) return { status: "off", missing };
  const range = { 7: "LAST_7_DAYS", 30: "LAST_30_DAYS", 90: "LAST_90_DAYS" }[clampDays(days)];
  try {
    const rows = await googleQuery(
      `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, customer.currency_code FROM campaign WHERE segments.date DURING ${range}`,
    );
    const byCampaign = new Map<string, GoogleRow[]>();
    const byDay = new Map<string, GoogleRow[]>();
    for (const r of rows) {
      const id = r.campaign?.id ?? "";
      byCampaign.set(id, [...(byCampaign.get(id) ?? []), r]);
      const d = r.segments?.date ?? "";
      byDay.set(d, [...(byDay.get(d) ?? []), r]);
    }
    return {
      status: "ok",
      currency: rows[0]?.customer?.currencyCode ?? "EUR",
      totals: googleTotals(rows),
      campaigns: [...byCampaign.entries()]
        .map(([id, list]) => ({ id, name: list[0].campaign?.name ?? "Campanha", status: list[0].campaign?.status, ...googleTotals(list) }))
        .sort((a, b) => b.spend - a.spend),
      daily: [...byDay.entries()]
        .map(([date, list]) => {
          const t = googleTotals(list);
          return { date, spend: t.spend, clicks: t.clicks };
        })
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : "Erro ao ligar à Google Ads." };
  }
}
