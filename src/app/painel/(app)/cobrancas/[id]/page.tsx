import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AssumptionContract } from "@/components/painel/assumption-contract";
import { ChargeContractDetail, SecondHolderCard } from "@/components/painel/charges";
import { CONTRACT_STATUS_LABEL, datePt, holderNames, toEuros } from "@/lib/cobrancas";
import { assuncaoSetup } from "@/server/assuncao";
import { can, requirePagePermission } from "@/server/auth/session";
import { chargeContract } from "@/server/cobrancas";
import { customerOptions } from "@/server/queries";

export const metadata = { title: "Venda a prestações" };

export default async function ChargePage(props: PageProps<"/painel/cobrancas/[id]">) {
  const user = await requirePagePermission("billing.manage");
  const { id } = await props.params;
  const sp = await props.searchParams;
  const [data, assumption, customers] = await Promise.all([chargeContract(id), assuncaoSetup(id), customerOptions()]);
  if (!data || !assumption) notFound();
  const { contract: c, payments } = data;

  return (
    <div className="a-page" style={{ maxWidth: 1000 }}>
      <Link href="/painel/cobrancas" className="a-crumb">
        <ChevronLeft size={15} /> Cobranças
      </Link>
      <div className="a-head">
        <div>
          <h1>{holderNames(c)}</h1>
          <p>
            {c.vehicle.label}
            {c.vehicle.plate ? ` · ${c.vehicle.plate}` : ""} · entregue a {datePt(c.deliveryDate)} · {CONTRACT_STATUS_LABEL[c.status]}
          </p>
        </div>
        <div className="a-actions">
          <Link href={`/painel/clientes/${c.customer.id}`} className="a-btn a-btn-sm">
            Ficha do cliente
          </Link>
          {c.secondCustomer && (
            <Link href={`/painel/clientes/${c.secondCustomer.id}`} className="a-btn a-btn-sm">
              Ficha do 2.º titular / fiador
            </Link>
          )}
          {c.vehicleId && (
            <Link href={`/painel/viaturas/${c.vehicleId}`} className="a-btn a-btn-sm">
              Viatura
            </Link>
          )}
        </div>
      </div>
      <ChargeContractDetail
        contract={c}
        payments={payments.map((p) => ({ id: p.id, installmentId: p.installmentId, date: p.date, amount: toEuros(p.amountCents), method: p.method, note: p.note }))}
        documents={
          <>
            <SecondHolderCard
              contractId={c.id}
              current={c.secondCustomer}
              customers={customers.map(({ id, label }) => ({ id, label }))}
              mainCustomerId={c.customer.id}
            />
            <AssumptionContract
              key={c.secondCustomer?.id ?? "-"}
              chargeId={c.id}
              defaults={assumption.defaults}
              stands={assumption.stands}
              generated={assumption.generated}
              autoOpen={sp.contrato === "1"}
              canDelete={can(user, "forms.generate")}
            />
          </>
        }
      />
    </div>
  );
}
