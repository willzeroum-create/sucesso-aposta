import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VehicleForm } from "@/components/painel/vehicle-form";
import { can, requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Nova viatura" };

export default async function NewVehiclePage() {
  const user = await requirePagePermission("vehicles.edit");
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <Link href="/painel/viaturas" className="a-crumb">
            <ArrowLeft size={14} /> Viaturas
          </Link>
          <h1>Dar entrada de viatura</h1>
          <p>Fica “Em preparação” e fora do site até a publicar.</p>
        </div>
      </div>
      <VehicleForm initial={{ category: "saloon" }} canCosts={can(user, "vehicles.costs")} />
    </div>
  );
}
