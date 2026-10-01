import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import { AnalyticsListener } from "@/components/public/analytics-listener";
import { JsonLd } from "@/components/public/json-ld";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { WhatsAppFloat } from "@/components/public/whatsapp-float";
import site from "@/components/public/site.module.css";
import { describeAcademy } from "@/lib/public-site/faq";
import { jsonLdGraph, organizationJsonLd, websiteJsonLd } from "@/lib/public-site/json-ld";
import { fetchPrimaryBranch, fetchPublicDanceStyles, fetchPublicSocialLinks } from "@/lib/public-site/queries";
import { SITE } from "@/lib/public-site/site";

const display = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
  // next/font has no metric overrides for Big Shoulders; a condensed system face keeps the swap shift small.
  adjustFontFallback: false,
  fallback: ["Impact", "Arial Narrow", "sans-serif"]
});

const body = Archivo({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  axes: ["wdth"]
});

const TITLE = "M&M Academia de Baile | Clases de baile en La Plata";

// Pages read the published catalog from the API, so they are rendered on demand. The
// API response itself is cached for a minute (see lib/public-site/api-source.ts), which
// keeps the build independent from the backend and the pages fast.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const description = describeAcademy((await fetchPublicDanceStyles()).map((style) => style.name));

  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: TITLE,
      template: "%s | M&M Academia de Baile"
    },
    description,
    applicationName: SITE.name,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      siteName: SITE.name,
      url: "/",
      title: TITLE,
      description
    },
    twitter: { card: "summary_large_image", title: TITLE, description },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false, address: false, email: false }
  };
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark"
};

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [branch, styles, socialLinks] = await Promise.all([
    fetchPrimaryBranch(),
    fetchPublicDanceStyles(),
    fetchPublicSocialLinks()
  ]);

  return (
    <div className={`${site.site} ${display.variable} ${body.variable}`} data-public-site="">
      <a href="#contenido" className={site.skipLink}>
        Saltar al contenido
      </a>
      <PublicHeader />
      <main id="contenido">{children}</main>
      <PublicFooter branch={branch} socialLinks={socialLinks} />
      <WhatsAppFloat />
      <AnalyticsListener />
      <JsonLd data={jsonLdGraph([organizationJsonLd(branch, styles, socialLinks), websiteJsonLd()])} />
    </div>
  );
}
