import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailFacts, DetailHero } from "@/components/public/detail-hero";
import { ArrowIcon, WhatsAppIcon } from "@/components/public/icons";
import { JsonLd } from "@/components/public/json-ld";
import { ScheduleSection } from "@/components/public/schedule-section";
import detail from "@/components/public/detail-page.module.css";
import site from "@/components/public/site.module.css";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { breadcrumbJsonLd, jsonLdGraph, personJsonLd } from "@/lib/public-site/json-ld";
import {
  fetchPublicDanceStyles,
  fetchPublicProfessor,
  fetchPublicProfessors,
  fetchPublicSchedule,
  fetchSiteImages,
  fetchUpcomingClasses
} from "@/lib/public-site/queries";
import { whatsappHref } from "@/lib/public-site/site";

export const revalidate = 600;
export const dynamicParams = false;

interface ProfessorPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return (await fetchPublicProfessors()).map((professor) => ({ slug: professor.slug }));
}

export async function generateMetadata({ params }: ProfessorPageProps): Promise<Metadata> {
  const professor = await fetchPublicProfessor((await params).slug);
  if (!professor) return {};
  const path = `/profesores/${professor.slug}`;
  const description = `${professor.displayName}, profesor/a en M&M Academia de Baile, La Plata. ${professor.quote ?? ""}`.trim();
  return {
    title: professor.displayName,
    description,
    alternates: { canonical: path },
    openGraph: { title: professor.displayName, description, url: path, images: [{ url: professor.avatar.src }] },
    robots: professor.isPlaceholder ? { index: false, follow: true } : undefined
  };
}

export default async function ProfessorPage({ params }: ProfessorPageProps) {
  const professor = await fetchPublicProfessor((await params).slug);
  if (!professor) notFound();

  const [styles, schedule, upcoming, images] = await Promise.all([
    fetchPublicDanceStyles(),
    fetchPublicSchedule(),
    fetchUpcomingClasses(50),
    fetchSiteImages()
  ]);

  const disciplines = styles.filter((style) => professor.disciplines.includes(style.slug));
  const teaches = (slugs: { slug: string }[]) => slugs.some((item) => item.slug === professor.slug);
  const entries = schedule.entries.filter((entry) => teaches(entry.professors));
  const nextClasses = upcoming.filter((item) => teaches(item.entry.professors)).slice(0, 3);
  const message = `Hola, vi la web de M&M Academia y quisiera consultar por las clases con ${professor.displayName}.`;

  return (
    <>
      <DetailHero
        crumbs={[{ name: "Inicio", href: "/" }, { name: "Profesores", href: "/profesores" }, { name: professor.displayName }]}
        kicker={disciplines.map((style) => style.name).join(" / ") || "Profesor/a"}
        image={professor.avatar}
        badge={professor.isPlaceholder ? <span className={site.placeholderTag}>Perfil de ejemplo</span> : undefined}
        title={
          <>
            <span>{professor.firstName}</span>{" "}
            {professor.lastName ? <span className={detail.accent}>{professor.lastName}</span> : null}
          </>
        }
      >
        {professor.quote ? <p className={detail.lead}>“{professor.quote}”</p> : null}
        <p>{professor.bio}</p>
        <DetailFacts
          items={[
            ...(disciplines.length
              ? [
                  {
                    term: "Enseña",
                    value: disciplines.map((style, index) => (
                      <span key={style.slug}>
                        {index > 0 ? " · " : ""}
                        <Link href={`/clases/${style.seoSlug}`}>{style.name}</Link>
                      </span>
                    ))
                  }
                ]
              : []),
            ...(professor.instagram
              ? [
                  {
                    term: "Instagram",
                    value: (
                      <a href={professor.instagram} target="_blank" rel="noopener noreferrer">
                        {professor.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "")}
                      </a>
                    )
                  }
                ]
              : [])
          ]}
        />
        <div className={detail.actions}>
          <a
            href={whatsappHref(message)}
            className={`${site.button} ${site.buttonPurple}`}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, `professor-${professor.slug}`)}
          >
            <WhatsAppIcon />
            Quiero tomar clase
            <ArrowIcon className={site.buttonArrow} />
          </a>
        </div>
      </DetailHero>

      <ScheduleSection
        entries={entries}
        upcoming={nextClasses}
        isPlaceholder={schedule.isPlaceholder}
        count="01"
        total={null}
        title={`Clases con ${professor.firstName}`}
      />

      <FinalCta image={images.finalCta} message={message} />

      <JsonLd
        data={jsonLdGraph([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Profesores", path: "/profesores" },
            { name: professor.displayName, path: `/profesores/${professor.slug}` }
          ]),
          personJsonLd(professor)
        ])}
      />
    </>
  );
}
