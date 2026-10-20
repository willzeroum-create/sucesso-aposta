import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aposta com Sucesso Cars — Mais que carros, grandes conquistas",
  description:
    "Aposta com Sucesso Cars: automóveis usados selecionados em Famões, Odivelas. Veja o stock com fotografias, preços e equipamento.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
