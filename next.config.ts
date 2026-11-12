import type { NextConfig } from "next";

const DOCX_PDF_FILES = [
  "./node_modules/@sparticuz/chromium/bin/**",
  "./node_modules/docx-preview/dist/docx-preview.min.js",
  "./node_modules/jszip/dist/jszip.min.js",
  "./node_modules/@fontsource/arimo/files/arimo-latin-*.woff2",
  "./node_modules/@fontsource/carlito/files/carlito-latin-*.woff2",
  "./node_modules/@fontsource/tinos/files/tinos-latin-*.woff2",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Cliente nativo do SQLite local (carregado só fora da Vercel) e processamento de imagem.
  serverExternalPackages: ["@libsql/client", "libsql", "sharp", "puppeteer-core", "@sparticuz/chromium"],
  // Word → PDF (src/server/docx-pdf.ts): o Chromium e o que a página de conversão carrega.
  outputFileTracingIncludes: {
    "/painel/**": DOCX_PDF_FILES,
    "/api/admin/**": DOCX_PDF_FILES,
  },
  // Só o domínio próprio fica no ar: o endereço *.vercel.app de produção redireciona para sucessopromissor.pt.
  // A API fica de fora para não partir integrações (WhatsApp, blü) que ainda chamem o endereço antigo.
  async redirects() {
    if (process.env.VERCEL_ENV !== "production") return [];
    const vercelHost = [{ type: "host" as const, value: "(?<sub>.+)\\.vercel\\.app" }];
    return [
      { source: "/", has: vercelHost, destination: "https://sucessopromissor.pt/", permanent: true },
      { source: "/:path((?!api/).*)", has: vercelHost, destination: "https://sucessopromissor.pt/:path", permanent: true },
    ];
  },
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    return [
      { source: "/:path*", headers: base },
      // Painel e API privada: nunca em cache partilhada nem indexados.
      { source: "/painel/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  images: {
    // Exact storage paths can be allowed by Claude when the media service exists.
    remotePatterns: (process.env.IMAGE_REMOTE_PATTERNS ?? "")
      .split(",")
      .map((pattern) => pattern.trim())
      .filter(Boolean)
      .map((pattern) => {
        const url = new URL(pattern);
        if (url.protocol !== "https:" || url.username || url.password) {
          throw new Error(
            "IMAGE_REMOTE_PATTERNS requires HTTPS URLs without credentials.",
          );
        }
        return url;
      }),
    maximumRedirects: 0,
  },
};

export default nextConfig;
