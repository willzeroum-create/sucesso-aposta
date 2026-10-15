import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PhoneCapturePage } from "@/components/painel/phone-capture-page";
import { captureByToken } from "@/server/capture";

export const metadata = { title: "Fotografar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const WHAT: Record<string, string> = {
  photos: "fotografias da viatura",
  vehicle: "documentos da viatura",
  customer: "documentos do cliente",
  none: "documentos",
};

/** Aberta no telemóvel a partir do código QR mostrado no computador. Não precisa de login. */
export default async function CapturePage(props: PageProps<"/painel/foto/[token]">) {
  const { token } = await props.params;
  const session = await captureByToken(token);
  // Para a pessoa confirmar no telemóvel que está a fotografar para o sítio certo.
  let place = "";
  if (session?.ownerId && (session.ownerType === "vehicle" || session.ownerType === "photos")) {
    const [v] = await db.select({ make: schema.vehicles.make, model: schema.vehicles.model, plate: schema.vehicles.plate }).from(schema.vehicles).where(eq(schema.vehicles.id, session.ownerId)).limit(1);
    if (v) place = `${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ""}`;
  } else if (session?.ownerId && session.ownerType === "customer") {
    const [c] = await db.select({ name: schema.customers.fullName }).from(schema.customers).where(eq(schema.customers.id, session.ownerId)).limit(1);
    if (c) place = c.name.split(/\s+/)[0] ?? "";
  }
  return (
    <main className="a-login" style={{ alignItems: "start", paddingTop: 24 }}>
      <PhoneCapturePage
        token={token}
        valid={Boolean(session)}
        what={session ? WHAT[session.ownerType] ?? "documentos" : ""}
        photos={session?.ownerType === "photos"}
        already={session?.fileIds.length ?? 0}
        place={place}
      />
    </main>
  );
}
