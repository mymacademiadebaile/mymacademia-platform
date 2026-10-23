import type { NextConfig } from "next";

// Must match SITE.url in src/lib/public-site/site.ts (asserted by next-config.test.ts).
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
    // These routes have no session-specific content. Caching the complete HTML
    // response at Vercel's edge prevents repeated SSR work from bots and
    // visitors while the public data cache refreshes independently.
    const headers = [
      {
        key: "Cache-Control",
        value: "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
      }
    ];

    return [
      { source: "/", headers },
      { source: "/clases/:path*", headers },
      { source: "/horarios", headers },
      { source: "/contacto", headers },
      { source: "/profesores/:path*", headers },
      { source: "/sitemap.xml", headers },
      { source: "/robots.txt", headers },
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
