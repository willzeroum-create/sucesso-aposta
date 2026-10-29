import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db, schema } from "@/db";
import { RegistrationEditor } from "@/components/painel/registration-editor";
import { requirePagePermission } from "@/server/auth/session";
import { registrationEditorProps } from "@/server/registration-editor";

export const metadata = { title: "Compra e venda" };

export default async function RegistrationPage(props: PageProps<"/painel/registo/[id]">) {
  const user = await requirePagePermission("forms.generate");
  const { id } = await props.params;
  const [row] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id)).limit(1);
  if (!row) notFound();
  const editor = await registrationEditorProps(row, user);
  const vehicle = editor.initial.vehicle;

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/registo" className="a-crumb">
        <ChevronLeft size={15} /> Compra e venda
      </Link>
      <div className="a-head">
        <div>
          <h1>{[vehicle.plate, [vehicle.make, vehicle.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Nova compra e venda"}</h1>
          <p>Requerimento de Registo Automóvel (Modelo 1 RA, IRN), pagamento e declarações da venda.</p>
        </div>
      </div>
      <RegistrationEditor {...editor} />
    </div>
  );
}
