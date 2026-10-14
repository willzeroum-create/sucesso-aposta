import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Cliente nativo do SQLite local (carregado só fora da Vercel) e processamento de imagem.
  serverExternalPackages: ["@libsql/client", "libsql", "sharp"],
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
