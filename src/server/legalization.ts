import "server-only";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { clientToRequester, davDeadline, isStage, STAGE_LABEL, type DavDeadline, type LegalClientData, type Stage } from "@/lib/legalizacao";
import { categoriaPT, emptyRequester, emptyVehicle, tipoPT, type Modelo9Requester, type Modelo9Vehicle } from "@/lib/modelo9";
import { formatPlate, formatPostalCodePt, isValidNif } from "@/lib/pt-validation";
import { audit } from "./audit";
import { newId } from "./ids";
import { getCompanyInfo } from "./settings";

type ClientRow = typeof schema.legalClients.$inferSelect;
type VehicleRow = typeof schema.vehicles.$inferSelect;

const FUEL_PT = { petrol: "Gasolina", diesel: "Gasóleo", hybrid: "Híbrido", electric: "Elétrico" } as const;
export const isPtPlate = (plate: string | null | undefined) => /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/.test(formatPlate(plate ?? ""));

/** Dados do carro do estoque → dados da viatura no Modelo 9. */
export function vehicleToModelo9(v: VehicleRow): Modelo9Vehicle {
  const vehicle = emptyVehicle();
  const j = (v.vehicleType ?? "").match(/\b([MN][1-3G]{1,2})\b/i)?.[1]?.toUpperCase() ?? "";
  Object.assign(vehicle, {
    make: v.make,
    model: v.model,
    version: v.version,
    vin: v.vin ?? "",
    foreignPlate: v.plate && !isPtPlate(v.plate) ? v.plate : "",
    firstRegistration: v.firstRegistration ?? "",
    homologation: v.homologation ?? "",
    euCategory: j,
    color: v.color ?? "",
    fuel: v.fuel ? FUEL_PT[v.fuel] : "",
    engineCc: v.engineCc ? String(v.engineCc) : "",
    seats: v.seats ? String(v.seats) : "",
    grossWeightKg: v.grossWeightKg ? String(v.grossWeightKg) : "",
    tareKg: v.tareKg ? String(v.tareKg) : "",
    co2: v.co2 ? String(v.co2) : "",
  } satisfies Partial<Modelo9Vehicle>);
  vehicle.category = categoriaPT(vehicle);
  vehicle.purpose = tipoPT(vehicle);
  return vehicle;
}

export async function companyRequester(): Promise<Modelo9Requester> {
  const c = await getCompanyInfo("sale");
  return { ...emptyRequester("empresa"), name: c.legalName, nif: c.nipc, certCode: c.certCode, address: c.address, postalCode: c.postalCode, city: c.city, email: c.email, phone: c.phone };
}

/** Os dados do requerente no formato da ficha do cliente. */
export function requesterToClient(r: Partial<Modelo9Requester>) {
  const nif = (r.nif ?? "").replace(/\D/g, "");
  return {
    kind: r.kind === "particular" ? ("particular" as const) : ("empresa" as const),
    name: (r.name ?? "").replace(/\s+/g, " ").trim(),
    nif: nif || null,
    docNumber: r.docNumber?.trim() || null,
    certCode: r.certCode?.trim() || null,
    address: r.address?.trim() || null,
    postalCode: r.postalCode?.trim() ? formatPostalCodePt(r.postalCode) : null,
    city: r.city?.trim() || null,
    email: r.email?.trim().toLowerCase() || null,
    phone: r.phone?.trim() || null,
  };
}

/** Encontra o cliente pelo NIF ou cria-o (requerente com nome e NIF válido). */
export async function findOrCreateClient(r: Partial<Modelo9Requester>, userId: string): Promise<string | null> {
  const data = requesterToClient(r);
  if (!data.name || !data.nif || !isValidNif(data.nif)) return null;
  const [found] = await db.select({ id: schema.legalClients.id }).from(schema.legalClients).where(eq(schema.legalClients.nif, data.nif)).limit(1);
  if (found) return found.id;
  const id = newId("lcl");
  await db.insert(schema.legalClients).values({ id, ...data, createdBy: userId });
  return id;
}

/**
 * Abre a legalização de um carro. Do estoque traz os dados da viatura e os documentos já fotografados
 * (livrete, CoC, fatura…); o cliente é o escolhido ou, por omissão, a empresa de vendas.
 */
export async function createLegalization(user: { id: string; name: string }, opts: { vehicleId?: string | null; clientId?: string | null; stage?: Stage }): Promise<string> {
  const stage = opts.stage ?? "modelo9";
  let vehicle = emptyVehicle();
  if (opts.vehicleId) {
    const [v] = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, opts.vehicleId)).limit(1);
    if (!v) throw new Error("Viatura não encontrada.");
    vehicle = vehicleToModelo9(v);
  }
  let requester = await companyRequester();
  if (opts.clientId) {
    const [c] = await db.select().from(schema.legalClients).where(eq(schema.legalClients.id, opts.clientId)).limit(1);
    if (!c) throw new Error("Cliente não encontrado.");
    requester = clientToRequester(clientData(c));
  }
  const id = newId("leg");
  const vehicleDocs = opts.vehicleId
    ? await db
        .select({ fileId: schema.documents.fileId, kind: schema.documents.kind, label: schema.documents.label })
        .from(schema.documents)
        .where(and(eq(schema.documents.ownerType, "vehicle"), eq(schema.documents.ownerId, opts.vehicleId)))
    : [];
  await db.insert(schema.legalizations).values({
    id,
    vehicleId: opts.vehicleId ?? null,
    clientId: opts.clientId ?? (await findOrCreateClient(requester, user.id)),
    stage,
    requester: { ...requester },
    vehicle: { ...vehicle },
    fileIds: vehicleDocs.map((d) => d.fileId),
    createdBy: user.id,
  });
  if (vehicleDocs.length)
    await db.insert(schema.documents).values(
      vehicleDocs.map((d) => ({ id: newId("doc"), ownerType: "legalization" as const, ownerId: id, kind: d.kind, label: d.label, fileId: d.fileId, uploadedBy: user.id })),
    );
  await audit(user, {
    action: "legalization.create",
    entityType: "legalization",
    entityId: id,
    summary: `Abriu a legalização${vehicle.make ? ` de ${vehicle.make} ${vehicle.model}` : ""} (${STAGE_LABEL[stage]})${vehicleDocs.length ? ` com ${vehicleDocs.length} documento(s) do carro` : ""}`,
  });
  return id;
}

/** Legalização ligada a um carro do estoque (a mais recente), para a ficha do carro. */
export async function vehicleLegalization(vehicleId: string) {
  const [l] = await db.select().from(schema.legalizations).where(eq(schema.legalizations.vehicleId, vehicleId)).orderBy(desc(schema.legalizations.createdAt)).limit(1);
  if (!l) return null;
  const stage = isStage(l.stage) ? l.stage : "modelo9";
  const docs = await db
    .select({ id: schema.documents.id, kind: schema.documents.kind, label: schema.documents.label, fileId: schema.documents.fileId, createdAt: schema.documents.createdAt, name: schema.files.originalName, mime: schema.files.mime })
    .from(schema.documents)
    .innerJoin(schema.files, eq(schema.files.id, schema.documents.fileId))
    .where(and(eq(schema.documents.ownerType, "legalization"), eq(schema.documents.ownerId, l.id)))
    .orderBy(desc(schema.documents.createdAt));
  return {
    id: l.id,
    stage,
    deadline: davDeadline(l.entryDate, stage, Boolean(l.customs?.davNumber?.trim())),
    ptPlate: l.registration?.ptPlate ?? "",
    inspectionDate: l.registration?.inspectionDate ?? "",
    davNumber: l.customs?.davNumber ?? "",
    modelo9: Boolean(l.modelo9FileId),
    docs: docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  };
}

/** Os carros em legalização por carro do estoque (para as listas): etapa de cada um. */
export async function legalizationStages(vehicleIds: string[]): Promise<Map<string, Stage>> {
  if (!vehicleIds.length) return new Map();
  const rows = await db
    .select({ vehicleId: schema.legalizations.vehicleId, stage: schema.legalizations.stage, createdAt: schema.legalizations.createdAt })
    .from(schema.legalizations)
    .where(inArray(schema.legalizations.vehicleId, vehicleIds))
    .orderBy(asc(schema.legalizations.createdAt));
  const out = new Map<string, Stage>();
  for (const r of rows) if (r.vehicleId && isStage(r.stage)) out.set(r.vehicleId, r.stage);
  return out;
}

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
