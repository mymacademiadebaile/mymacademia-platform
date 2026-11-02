import type { NextConfig } from "next";

// Must match SITE.url in src/lib/public-site/site.ts (asserted by host-policy.test.ts).
const OFFICIAL_ORIGIN = "https://www.mymacademiadebaile.com.ar";
const OFFICIAL_HOST = "www\\.mymacademiadebaile\\.com\\.ar";
// Vercel's production alias duplicates the public site. Only indexable pages move;
// /api, auth, backoffice, professor portal, check-in and assets stay on each host.
const VERCEL_PRODUCTION_HOST = "mymacademia-platform\\.vercel\\.app";
const PUBLIC_PAGES = ["/", "/clases", "/clases/:slug", "/horarios", "/contacto", "/profesores", "/profesores/:slug"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.MYM_E2E_DIST_DIR ? { distDir: process.env.MYM_E2E_DIST_DIR } : {}),
  typescript: { tsconfigPath: process.env.MYM_E2E_TSCONFIG ?? "tsconfig.json" },
  images: {
    unoptimized: true,
    // Rhythm covers and professor photos uploaded from the backoffice live on Cloudinary.
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }]
  },
  async headers() {
    return [
      { source: "/robots.txt", headers: [{ key: "Cache-Control", value: "public, max-age=60, s-maxage=300, stale-while-revalidate=86400" }] },
      // Previews, deployment URLs and the Vercel alias stay crawlable (robots.txt
      // allows them) so search engines can read this header and the redirects.
      {
        source: "/:path*",
        missing: [{ type: "host", value: OFFICIAL_HOST }],
        headers: [{ key: "X-Robots-Tag", value: "noindex" }]
      }
    ];
  },
  async redirects() {
    return PUBLIC_PAGES.map((source) => ({
      source,
      has: [{ type: "host" as const, value: VERCEL_PRODUCTION_HOST }],
      destination: `${OFFICIAL_ORIGIN}${source}`,
      permanent: true
    }));
  }
};

export default nextConfig;
