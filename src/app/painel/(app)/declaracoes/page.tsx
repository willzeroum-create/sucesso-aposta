import { Declarations, type DeclarationDoc } from "@/components/painel/declarations";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/form-templates";
import { requirePagePermission } from "@/server/auth/session";
import { templateFieldKeys } from "@/server/forms";
import { customerOptions, formHistory, templateInfos, vehicleOptions } from "@/server/queries";

export const metadata = { title: "Declarações" };

export default async function DeclarationsPage(props: PageProps<"/painel/declaracoes">) {
  await requirePagePermission("forms.generate");
  const sp = await props.searchParams;
  const initial = typeof sp.doc === "string" && (TEMPLATE_IDS as string[]).includes(sp.doc) ? (sp.doc as TemplateId) : null;
  const docs: DeclarationDoc[] = await Promise.all(
    (await templateInfos()).map(async (t) => ({ id: t.id, title: t.title, description: t.description, mode: t.mode, fields: await templateFieldKeys(t.id) })),
  );
  const [customers, vehicles, history] = await Promise.all([customerOptions(), vehicleOptions(), formHistory({ limit: 30 })]);
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Declarações</h1>
          <p>Qualquer documento à parte, sem passar pela venda do carro: escolha, ponha as fotos (ou escreva), confira e gere.</p>
        </div>
      </div>
      <Declarations docs={docs} customers={customers} vehicles={vehicles} history={history} initial={initial} />
    </div>
  );
}
