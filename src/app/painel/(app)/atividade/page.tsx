import Link from "next/link";
import { and, asc, desc, eq, ilike, lt, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { dateTime } from "@/lib/labels";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Atividade" };

const AREAS: Record<string, string> = {
  vehicle: "Viaturas",
  customer: "Clientes",
  lead: "Pedidos",
  user: "Utilizadores e acessos",
  role: "Funções",
  settings: "Configurações",
  hero: "Capas do site",
  template: "Modelos",
};

const LINK: Record<string, (id: string) => string> = {
  vehicle: (id) => `/painel/viaturas/${id}`,
  customer: (id) => `/painel/clientes/${id}`,
  lead: (id) => `/painel/crm/${id}`,
};

const PAGE = 100;

export default async function ActivityPage(props: PageProps<"/painel/atividade">) {
  await requirePagePermission("audit.view");
  const sp = await props.searchParams;
  const who = typeof sp.quem === "string" ? sp.quem : "";
  const area = typeof sp.area === "string" && sp.area in AREAS ? sp.area : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const before = typeof sp.antes === "string" && /^\d+$/.test(sp.antes) ? new Date(Number(sp.antes)) : null;

  const where: SQL[] = [];
  if (who) where.push(eq(schema.auditLogs.userId, who));
  if (area) where.push(eq(schema.auditLogs.entityType, area));
  if (q) where.push(ilike(schema.auditLogs.summary, `%${q.replace(/[%_]/g, "")}%`));
  if (before) where.push(lt(schema.auditLogs.createdAt, before));
  const rows = await db.select().from(schema.auditLogs).where(and(...where)).orderBy(desc(schema.auditLogs.createdAt)).limit(PAGE);
  const users = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(asc(schema.users.name));
  const last = rows.at(-1);

  return (
    <div className="a-page">
      <div className="a-head">
        <div>
          <h1>Atividade</h1>
          <p>Registo de quem fez cada ação no painel. Não pode ser editado nem apagado pelo painel.</p>
        </div>
      </div>
      <form className="a-card a-card-pad" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div className="a-field" style={{ minWidth: 180 }}>
          <label htmlFor="quem">Pessoa</label>
          <select id="quem" name="quem" defaultValue={who}>
            <option value="">Todas</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field" style={{ minWidth: 180 }}>
          <label htmlFor="area">Área</label>
          <select id="area" name="area" defaultValue={area}>
            <option value="">Todas</option>
            {Object.entries(AREAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field" style={{ flex: "1 1 200px" }}>
          <label htmlFor="q">Contém</label>
          <input id="q" name="q" defaultValue={q} placeholder="ex.: BMW, publicou, palavra-passe" />
        </div>
        <button className="a-btn">Filtrar</button>
      </form>
      <section className="a-card">
        {rows.length ? (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>O quê</th>
                  <th className="hide-sm">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = r.entityId && LINK[r.entityType]?.(r.entityId);
                  return (
                    <tr key={r.id}>
                      <td className="muted num" style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                        {dateTime(r.createdAt)}
                      </td>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{r.userName}</td>
                      <td>{href ? <Link href={href} className="a-link">{r.summary}</Link> : r.summary}</td>
                      <td className="hide-sm muted" style={{ fontSize: 12.5, maxWidth: 360 }}>
                        {r.changes
                          ? Object.entries(r.changes)
                              .slice(0, 6)
                              .map(([k, [a, b]]) => `${k}: ${a ?? "—"} → ${b ?? "—"}`)
                              .join(" · ")
                          : r.ip ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a-empty">Sem registos com estes filtros.</div>
        )}
      </section>
      {rows.length === PAGE && last && (
        <Link className="a-btn" style={{ justifySelf: "start" }} href={`/painel/atividade?${new URLSearchParams({ ...(who ? { quem: who } : {}), ...(area ? { area } : {}), ...(q ? { q } : {}), antes: String(last.createdAt.getTime()) })}`}>
          Ver registos mais antigos
        </Link>
      )}
    </div>
  );
}
