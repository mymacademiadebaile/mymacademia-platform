import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import { AnalyticsListener } from "@/components/public/analytics-listener";
import { JsonLd } from "@/components/public/json-ld";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";
import { WhatsAppFloat } from "@/components/public/whatsapp-cta";
import site from "@/components/public/site.module.css";
import { jsonLdGraph, organizationJsonLd, websiteJsonLd } from "@/lib/public-site/json-ld";
import { fetchPrimaryBranch, fetchPublicDanceStyles } from "@/lib/public-site/queries";
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

const DESCRIPTION =
  "Academia de baile en La Plata. Clases de Bachata Sensual, Bachata Zouk y Estilo Femenino en Calle 3 N.º 164, entre 35 y 36. Consultá horarios y empezá por WhatsApp.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "M&M Academia de Baile | Clases de baile en La Plata",
    template: "%s | M&M Academia de Baile"
  },
  description: DESCRIPTION,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: SITE.name,
    url: "/",
    title: "M&M Academia de Baile | Clases de baile en La Plata",
    description: DESCRIPTION
  },
  twitter: {
    card: "summary_large_image",
    title: "M&M Academia de Baile | Clases de baile en La Plata",
    description: DESCRIPTION
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false }
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  colorScheme: "dark"
};

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [branch, styles] = await Promise.all([fetchPrimaryBranch(), fetchPublicDanceStyles()]);

  return (
    <div className={`${site.site} ${display.variable} ${body.variable}`} data-public-site="">
      <a href="#contenido" className={site.skipLink}>
        Saltar al contenido
      </a>
      <PublicHeader />
      <main id="contenido">{children}</main>
      <PublicFooter branch={branch} />
      <WhatsAppFloat />
      <AnalyticsListener />
      <JsonLd data={jsonLdGraph([organizationJsonLd(branch, styles), websiteJsonLd()])} />
    </div>
  );
}
