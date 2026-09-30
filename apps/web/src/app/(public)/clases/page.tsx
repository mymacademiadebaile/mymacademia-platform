import type { Metadata } from "next";
import { DanceStyles } from "@/components/public/dance-styles";
import { FaqSection } from "@/components/public/faq-section";
import { JsonLd } from "@/components/public/json-ld";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { describeAcademy } from "@/lib/public-site/faq";
import { breadcrumbJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import { fetchPublicDanceStyles, fetchPublicFaq, fetchPublicProfessors, fetchSiteImages } from "@/lib/public-site/queries";

export async function generateMetadata(): Promise<Metadata> {
  const names = (await fetchPublicDanceStyles()).map((style) => style.name);
  const description = `${describeAcademy(names)} Conocé cada estilo, sus niveles y quién enseña.`;

  return {
    title: "Clases de baile en La Plata",
    description,
    alternates: { canonical: "/clases" },
    openGraph: { title: "Clases de baile en La Plata", description, url: "/clases" }
  };
}

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
