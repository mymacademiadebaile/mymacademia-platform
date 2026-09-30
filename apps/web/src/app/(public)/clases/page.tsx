import type { Metadata } from "next";
import { DanceStyles } from "@/components/public/dance-styles";
import { FaqSection } from "@/components/public/faq-section";
import { JsonLd } from "@/components/public/json-ld";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { breadcrumbJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import { fetchPublicDanceStyles, fetchPublicFaq, fetchPublicProfessors, fetchSiteImages } from "@/lib/public-site/queries";

const DESCRIPTION =
  "Clases de Bachata Sensual, Bachata Zouk y Estilo Femenino en La Plata. Conocé cada estilo, sus niveles y quién enseña en M&M Academia de Baile.";

export const metadata: Metadata = {
  title: "Clases de baile en La Plata",
  description: DESCRIPTION,
  alternates: { canonical: "/clases" },
  openGraph: { title: "Clases de baile en La Plata", description: DESCRIPTION, url: "/clases" }
};

export default async function ClassesPage() {
  const [styles, professors, faq, images] = await Promise.all([
    fetchPublicDanceStyles(),
    fetchPublicProfessors(),
    fetchPublicFaq(),
    fetchSiteImages()
  ]);

  return (
    <>
      <DanceStyles styles={styles} professors={professors} headingAs="h1" count="01" total={null} />
      <FaqSection items={faq} />
      <FinalCta image={images.finalCta} />
      <JsonLd
        data={jsonLdGraph([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Clases", path: "/clases" }
          ])
        ])}
      />
    </>
  );
}
