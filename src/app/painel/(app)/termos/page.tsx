import { FormGenerator } from "@/components/painel/form-generator";
import { requirePagePermission } from "@/server/auth/session";
import { customerOptions, formHistory, templateInfos, vehicleOptions } from "@/server/queries";

export const metadata = { title: "Termos e fichas" };

export default async function FormsPage() {
  await requirePagePermission("forms.generate");
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <h1>Termos e fichas</h1>
          <p>Termo de entrega e responsabilidade, contrato, declaração de venda ao stand, ficha de cliente e dados para o registo automóvel.</p>
        </div>
      </div>
      <FormGenerator templates={await templateInfos()} customers={await customerOptions()} vehicles={await vehicleOptions()} history={await formHistory({ limit: 30 })} />
      <p className="muted" style={{ fontSize: 13 }}>
        O registo de propriedade continua a ser feito com o Requerimento de Registo Automóvel (IRN ou Automóvel Online). Os textos dos modelos editam-se em Configurações → Modelos de documentos.
      </p>
    </div>
  );
}
