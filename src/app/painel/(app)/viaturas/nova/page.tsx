import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VehicleForm } from "@/components/painel/vehicle-form";
import { isSection, SECTIONS } from "@/lib/sections";
import { can, requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Dar entrada de carro" };

/**
 * Entrada de um carro (ex.: chega de exportação): fotografias do carro e dos documentos, dados, destino
 * (Venda no site, Aluguer ou Só estoque) e, se for importado, a legalização aberta logo.
 */
export default async function NewVehiclePage(props: PageProps<"/painel/viaturas/nova">) {
  const user = await requirePagePermission("vehicles.edit");
  const sp = await props.searchParams;
  const section = isSection(sp.seccao) ? sp.seccao : "site";
  const back = section === "site" ? SECTIONS.site : SECTIONS.estoque;
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <Link href={back.base} className="a-crumb">
            <ArrowLeft size={14} /> {back.crumb}
          </Link>
          <h1>Dar entrada de carro</h1>
          <p>Fotografe o carro e os documentos, confira os dados e escolha o destino. Fica “Em preparação” (fora do site) até estar pronto.</p>
        </div>
      </div>
      <VehicleForm initial={{ category: "saloon" }} canCosts={can(user, "vehicles.costs")} section={section} canLegalize={can(user, "forms.generate")} />
    </div>
  );
}
