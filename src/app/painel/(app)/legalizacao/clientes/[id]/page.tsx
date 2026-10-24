import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft, FileCheck2, FilePlus2 } from "lucide-react";
import { db, schema } from "@/db";
import { newLegalization } from "@/app/painel/_actions/legalizations";
import { LegalCarRows } from "@/components/painel/legal-cars";
import { LegalClientForm } from "@/components/painel/legal-client-form";
import { requirePagePermission } from "@/server/auth/session";
import { byClient, clientData, legalCars } from "@/server/legalization";

export const metadata = { title: "Cliente da legalização" };

export default async function LegalClientPage(props: PageProps<"/painel/legalizacao/clientes/[id]">) {
  await requirePagePermission("forms.generate");
  const { id } = await props.params;
  const [c] = await db.select().from(schema.legalClients).where(eq(schema.legalClients.id, id)).limit(1);
  if (!c) notFound();
  const cars = await legalCars(byClient(id));
  const done = cars.filter((x) => x.stage === "concluido").length;

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/legalizacao/clientes" className="a-crumb">
        <ChevronLeft size={15} /> Clientes da legalização
      </Link>
      <div className="a-head">
        <div>
          <h1>{c.name}</h1>
          <p>
            {[c.kind === "empresa" ? "Empresa" : "Particular", c.nif ? `NIF ${c.nif}` : null, `${cars.length} carro${cars.length === 1 ? "" : "s"}`, done ? `${done} concluído${done === 1 ? "" : "s"}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <section className="a-card">
        <div className="a-card-head">
          <div>
            <h2>Carros deste cliente</h2>
            <p>Cada carro tem as três etapas e todos os documentos guardados.</p>
          </div>
          <div className="a-actions">
            <form action={newLegalization}>
              <input type="hidden" name="clientId" value={c.id} />
              <input type="hidden" name="stage" value="modelo9" />
              <button type="submit" className="a-btn a-btn-sm a-btn-primary">
                <FilePlus2 size={15} /> Novo carro
              </button>
            </form>
            <form action={newLegalization}>
              <input type="hidden" name="clientId" value={c.id} />
              <input type="hidden" name="stage" value="registo" />
              <button type="submit" className="a-btn a-btn-sm">
                <FileCheck2 size={15} /> Só registo inicial
              </button>
            </form>
          </div>
        </div>
        {cars.length ? (
          <LegalCarRows cars={cars} />
        ) : (
          <div className="a-empty">
            <strong>Ainda sem carros.</strong>
            <span className="muted">Carregue em “Novo carro” e fotografe o livrete estrangeiro.</span>
          </div>
        )}
      </section>

      <LegalClientForm client={{ id: c.id, data: clientData(c) }} cars={cars.length} />
    </div>
  );
}
