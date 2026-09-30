import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/public-site/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private shells and auth flows are never indexed.
      disallow: ["/admin", "/professor", "/login", "/forgot-password", "/reset-password"]
    },
    sitemap: absoluteUrl("/sitemap.xml")
  };
}
