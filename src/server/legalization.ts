import "server-only";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { davDeadline, isStage, type DavDeadline, type LegalClientData, type Stage } from "@/lib/legalizacao";

type ClientRow = typeof schema.legalClients.$inferSelect;

export function clientData(c: ClientRow): LegalClientData {
  return {
    kind: c.kind,
    name: c.name,
    nif: c.nif ?? "",
    docNumber: c.docNumber ?? "",
    certCode: c.certCode ?? "",
    address: c.address ?? "",
    postalCode: c.postalCode ?? "",
    city: c.city ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    notes: c.notes ?? "",
  };
}

/** Clientes da legalização para escolher num processo (com os dados, para preencher o requerente). */
export async function legalClientOptions() {
  const rows = await db.select().from(schema.legalClients).orderBy(asc(schema.legalClients.name)).limit(2000);
  return rows.map((c) => ({ id: c.id, label: c.nif ? `${c.name} · NIF ${c.nif}` : c.name, data: clientData(c) }));
}

export type LegalCarRow = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  title: string;
  sub: string;
  stage: Stage;
  deadline: DavDeadline;
  ptPlate: string;
  holderName: string;
  regDate: string;
  regType: string;
  regNumber: string;
  vin: string;
  docs: number;
  updatedAt: string;
};

/** Carros em legalização (para as listas), já com o prazo da DAV e o nº de documentos. */
export async function legalCars(where?: SQL): Promise<LegalCarRow[]> {
  const rows = await db
    .select({ l: schema.legalizations, clientName: schema.legalClients.name, stockMake: schema.vehicles.make, stockModel: schema.vehicles.model })
    .from(schema.legalizations)
    .leftJoin(schema.legalClients, eq(schema.legalClients.id, schema.legalizations.clientId))
    .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.legalizations.vehicleId))
    .where(where)
    .orderBy(desc(schema.legalizations.updatedAt))
    .limit(1000);
  const ids = rows.map((r) => r.l.id);
  const counts = ids.length
    ? await db
        .select({ ownerId: schema.documents.ownerId, n: count() })
        .from(schema.documents)
        .where(and(eq(schema.documents.ownerType, "legalization"), inArray(schema.documents.ownerId, ids)))
        .groupBy(schema.documents.ownerId)
    : [];
  return rows.map(({ l, clientName, stockMake, stockModel }) => {
    const v = l.vehicle ?? {};
    const r = l.registration ?? {};
    const stage = isStage(l.stage) ? l.stage : "modelo9";
    return {
      id: l.id,
      clientId: l.clientId,
      clientName,
      title: [v.make || stockMake, v.model || stockModel].filter(Boolean).join(" ") || "Carro por identificar",
      sub: [v.foreignPlate, r.ptPlate ? `→ ${r.ptPlate}` : "", v.vin].filter(Boolean).join(" · ") || "Sem dados do livrete",
      stage,
      deadline: davDeadline(l.entryDate, stage, Boolean(l.customs?.davNumber?.trim())),
      ptPlate: r.ptPlate ?? "",
      holderName: r.holderName ?? "",
      regDate: r.regDate ?? "",
      regType: r.regType ?? "",
      regNumber: r.regNumber ?? "",
      vin: v.vin ?? "",
      docs: Number(counts.find((c) => c.ownerId === l.id)?.n ?? 0),
      updatedAt: l.updatedAt.toISOString(),
    };
  });
}

export const byClient = (id: string) => eq(schema.legalizations.clientId, id);
