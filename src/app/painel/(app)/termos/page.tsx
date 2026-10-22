import { redirect } from "next/navigation";

/** "Termos e fichas" passou a "Declarações" (mesmos documentos, sem precisar de cliente ou viatura registados). */
export default function FormsPage() {
  redirect("/painel/declaracoes");
}
