import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ToastProvider } from "@/components/painel/ui";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  robots: { index: false, follow: false },
  manifest: "/painel/app.webmanifest",
  appleWebApp: { capable: true, title: "Painel", statusBarStyle: "default" },
  icons: { apple: "/painel-icon-180.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0ed" },
    { media: "(prefers-color-scheme: dark)", color: "#121513" },
  ],
};

export default async function PainelRoot({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("sa_theme")?.value;
  return (
    <div className="adm" data-theme={theme === "dark" || theme === "light" ? theme : undefined}>
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
