import type { Metadata } from "next";
import { JsonLd } from "@/components/public/json-ld";
import { PageIntro } from "@/components/public/page-intro";
import { ScheduleSection } from "@/components/public/schedule-section";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { breadcrumbJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import { joinNames } from "@/lib/public-site/faq";
import { fetchPublicDanceStyles, fetchPublicSchedule, fetchSiteImages, fetchUpcomingClasses } from "@/lib/public-site/queries";

export async function generateMetadata(): Promise<Metadata> {
  const names = (await fetchPublicDanceStyles()).map((style) => style.name);
  const description = `Horario semanal de clases de baile en La Plata${names.length ? `: ${joinNames(names)}` : ""}, en M&M Academia de Baile, Calle 3 N.º 164.`;

  return {
    title: "Horarios de clases de baile en La Plata",
    description,
    alternates: { canonical: "/horarios" },
    openGraph: { title: "Horarios de clases de baile en La Plata", description, url: "/horarios" }
  };
}

export default async function SchedulePage() {
  const [schedule, upcoming, images] = await Promise.all([
    fetchPublicSchedule(),
    fetchUpcomingClasses(3),
    fetchSiteImages()
  ]);

  return (
    <>
      <PageIntro crumbs={[{ name: "Inicio", href: "/" }, { name: "Horarios" }]} kicker="Horarios" title="Cuándo venir a bailar">
        <p>
          Todas las clases de la semana en M&amp;M Academia de Baile, en Calle 3 N.º 164, La Plata. Elegí el estilo y el
          nivel, y escribinos para confirmar tu lugar.
        </p>
      </PageIntro>
      <ScheduleSection
        entries={schedule.entries}
        upcoming={upcoming}
        isPlaceholder={schedule.isPlaceholder}
        count="01"
        total={null}
      />
      <FinalCta image={images.finalCta} />
      <JsonLd
        data={jsonLdGraph([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Horarios", path: "/horarios" }
          ])
        ])}
      />
    </>
  );
}
