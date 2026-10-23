import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
      { source: "/robots.txt", headers }
    ];
  }
};

export default nextConfig;
