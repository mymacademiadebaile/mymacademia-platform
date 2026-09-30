import type { Metadata } from "next";
import { JsonLd } from "@/components/public/json-ld";
import { ProfessorShowcase } from "@/components/public/professor-showcase";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { breadcrumbJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import { fetchPublicDanceStyles, fetchPublicProfessors, fetchSiteImages } from "@/lib/public-site/queries";

const DESCRIPTION = "Conocé a las profesoras y profesores de M&M Academia de Baile en La Plata y los estilos que enseña cada uno.";

export async function generateMetadata(): Promise<Metadata> {
  const professors = await fetchPublicProfessors();
  return {
    title: "Profesores",
    description: DESCRIPTION,
    alternates: { canonical: "/profesores" },
    openGraph: { title: "Profesores", description: DESCRIPTION, url: "/profesores" },
    // Keep out of the index while profiles are placeholders.
    robots:
      professors.length === 0 || professors.some((professor) => professor.isPlaceholder)
        ? { index: false, follow: true }
        : undefined
  };
}

export default async function ProfessorsPage() {
  const [professors, styles, images] = await Promise.all([
    fetchPublicProfessors(),
    fetchPublicDanceStyles(),
    fetchSiteImages()
  ]);

  return (
    <>
      <ProfessorShowcase professors={professors} styles={styles} headingAs="h1" count="01" total={null} />
      <FinalCta image={images.finalCta} />
      <JsonLd
        data={jsonLdGraph([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Profesores", path: "/profesores" }
          ])
        ])}
      />
    </>
  );
}
