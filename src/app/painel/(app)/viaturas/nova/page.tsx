import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VehicleForm } from "@/components/painel/vehicle-form";
import { isSection, SECTIONS } from "@/lib/sections";
import { can, requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Nova viatura" };

const INTRO = {
  site: { title: "Dar entrada de viatura", text: "Fica “Em preparação” e fora do site até a publicar." },
  estoque: { title: "Dar entrada no estoque", text: "Carro do estoque interno: nunca aparece no site. Depois junte custos, documentos e mais dados." },
  aluguer: { title: "Novo carro de aluguer", text: "Carro da frota de aluguer: nunca aparece no site. Os alugueres registam-se na página Aluguer." },
} as const;

export default async function NewVehiclePage(props: PageProps<"/painel/viaturas/nova">) {
  const user = await requirePagePermission("vehicles.edit");
  const sp = await props.searchParams;
  const section = isSection(sp.seccao) ? sp.seccao : "site";
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <Link href={SECTIONS[section].base} className="a-crumb">
            <ArrowLeft size={14} /> {SECTIONS[section].crumb}
          </Link>
          <h1>{INTRO[section].title}</h1>
          <p>{INTRO[section].text}</p>
        </div>
      </div>
      <VehicleForm initial={{ category: "saloon" }} canCosts={can(user, "vehicles.costs")} section={section} />
    </div>
  );
}
