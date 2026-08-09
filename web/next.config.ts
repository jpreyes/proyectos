import type { NextConfig } from "next";

// In production cloudflared routes /api and /_ straight to PocketBase, so Next
// never sees them. In dev there is no tunnel, so we proxy the same two prefixes
// ourselves — that keeps dev and prod on a single origin and makes the session
// cookie behave identically in both.
const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const pb = process.env.PB_URL_INTERNAL || "http://127.0.0.1:8090";
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${pb}/api/:path*` },
        { source: "/_/:path*", destination: `${pb}/_/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
