import Link from "next/link";

export default function VehicleNotFound() {
  return (
    <main className="status-page">
      <span className="eyebrow">VIATURA INDISPONÍVEL</span>
      <h1>Este carro já não está disponível.</h1>
      <p>Pode ter sido vendido ou retirado do stand. Veja as outras viaturas da nossa seleção.</p>
      <Link href="/#colecao" className="button button-primary">
        Ver o stock
      </Link>
    </main>
  );
}
