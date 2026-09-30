import type { Metadata } from "next";
import { FaqSection } from "@/components/public/faq-section";
import { JsonLd } from "@/components/public/json-ld";
import { LocationSection } from "@/components/public/location-section";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { breadcrumbJsonLd, faqJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import { fetchPrimaryBranch, fetchPublicFaq, fetchSiteImages } from "@/lib/public-site/queries";

const DESCRIPTION =
  "Cómo llegar a M&M Academia de Baile: Calle 3 N.º 164, entre 35 y 36, La Plata. Consultas e inscripción por WhatsApp al +54 9 221 596-8108.";

export const metadata: Metadata = {
  title: "Contacto y cómo llegar",
  description: DESCRIPTION,
  alternates: { canonical: "/contacto" },
  openGraph: { title: "Contacto y cómo llegar", description: DESCRIPTION, url: "/contacto" }
};

export default async function ContactPage() {
  const [branch, faq, images] = await Promise.all([fetchPrimaryBranch(), fetchPublicFaq(), fetchSiteImages()]);

  return (
    <>
      <LocationSection branch={branch} headingAs="h1" count="01" total={null} />
      <FaqSection items={faq} />
      <FinalCta image={images.finalCta} />
      <JsonLd
        data={jsonLdGraph([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Contacto", path: "/contacto" }
          ]),
          faqJsonLd(faq)
        ])}
      />
    </>
  );
}
