import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
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
