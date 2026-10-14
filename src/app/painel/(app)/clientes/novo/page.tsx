import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerForm } from "@/components/painel/customer-form";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Nova ficha de cliente" };

export default async function NewCustomerPage() {
  await requirePagePermission("customers.edit");
  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <div className="a-head">
        <div>
          <Link href="/painel/clientes" className="a-crumb">
            <ArrowLeft size={14} /> Clientes
          </Link>
          <h1>Gerar ficha de cliente</h1>
          <p>Fotografe o documento de identificação: os dados são propostos para confirmar.</p>
        </div>
      </div>
      <CustomerForm initial={{ country: "Portugal" }} />
    </div>
  );
}
