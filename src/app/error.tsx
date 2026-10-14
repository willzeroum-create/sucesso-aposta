"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="status-page">
      <span className="eyebrow">SUCESSO APOSTA</span>
      <h1>Fazemos uma breve paragem.</h1>
      <p>
        Não foi possível carregar a seleção de viaturas. Por favor, tente
        novamente.
      </p>
      <button className="button button-primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
