import Link from "next/link";

export default function NotFound() {
  return (
    <main className="status-page">
      <span className="eyebrow">404 · FORA DE ROTA</span>
      <h1>Vamos voltar ao caminho.</h1>
      <p>Esta página não faz parte da nossa seleção.</p>
      <Link href="/" className="button button-primary">
        Voltar ao início
      </Link>
    </main>
  );
}
