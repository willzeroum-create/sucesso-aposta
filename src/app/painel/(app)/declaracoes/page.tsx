import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Declarations, type DeclarationDoc } from "@/components/painel/declarations";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { can, requirePagePermission } from "@/server/auth/session";
import { templateFieldKeys } from "@/server/forms";
import { customerOptions, formHistory, templateInfos, vehicleOptions } from "@/server/queries";

export const metadata = { title: "Declarações" };

export default async function DeclarationsPage(props: PageProps<"/painel/declaracoes">) {
  const user = await requirePagePermission("forms.generate");
  const sp = await props.searchParams;
  const initial = typeof sp.doc === "string" && (TEMPLATE_IDS as string[]).includes(sp.doc) ? (sp.doc as TemplateId) : null;
  const docs: DeclarationDoc[] = await Promise.all(
    (await templateInfos()).map(async (t) => ({ id: t.id, title: t.title, description: t.description, mode: t.mode, fields: await templateFieldKeys(t.id) })),
  );
  const [customers, vehicles, history] = await Promise.all([customerOptions(), vehicleOptions(), formHistory({ limit: 30 })]);
  // Contrato de pagamento a prestações: só para quem gere as Cobranças.
  const charges = can(user, "billing.manage")
    ? (
        await db
          .select({ id: schema.chargeContracts.id, name: schema.customers.fullName, make: schema.chargeContracts.make, model: schema.chargeContracts.model, plate: schema.chargeContracts.plate })
          .from(schema.chargeContracts)
          .innerJoin(schema.customers, eq(schema.customers.id, schema.chargeContracts.customerId))
          .orderBy(desc(schema.chargeContracts.createdAt))
          .limit(500)
      ).map((c) => ({ id: c.id, label: [c.name, [c.make, c.model].filter(Boolean).join(" "), c.plate].filter(Boolean).join(" · ") }))
    : null;
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Declarações</h1>
          <p>Qualquer documento à parte, sem passar pela venda do carro: escolha, ponha as fotos (ou escreva), confira e gere.</p>
        </div>
      </div>
      <Declarations docs={docs} customers={customers} vehicles={vehicles} history={history} initial={initial} charges={charges} />
    </div>
  );
}
