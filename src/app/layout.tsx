import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sucesso Aposta — Automóveis com presença",
  description:
    "Uma seleção de automóveis para quem valoriza cada detalhe. Descubra a primeira edição de Sucesso Aposta. Projeto em demonstração.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
