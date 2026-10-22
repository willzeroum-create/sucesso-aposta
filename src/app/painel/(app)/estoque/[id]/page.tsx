import VehiclePage from "../../viaturas/[id]/page";

export { generateMetadata } from "../../viaturas/[id]/page";

/** Ficha de um carro do Estoque (venda ou aluguer): a mesma ficha de "Viaturas", no caminho do Estoque. */
export default function StockVehiclePage(props: PageProps<"/painel/estoque/[id]">) {
  return VehiclePage({ ...(props as unknown as PageProps<"/painel/viaturas/[id]">), stockRoute: true });
}
