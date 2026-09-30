import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailFacts, DetailHero } from "@/components/public/detail-hero";
import { FaqSection } from "@/components/public/faq-section";
import { ArrowIcon, WhatsAppIcon } from "@/components/public/icons";
import { JsonLd } from "@/components/public/json-ld";
import { ProfessorShowcase } from "@/components/public/professor-showcase";
import { ClassesSection } from "@/components/public/classes-section";
import detail from "@/components/public/detail-page.module.css";
import site from "@/components/public/site.module.css";
import { FinalCta } from "@/components/public/whatsapp-cta";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import { breadcrumbJsonLd, faqJsonLd, jsonLdGraph } from "@/lib/public-site/json-ld";
import {
  fetchPrimaryBranch,
  fetchPublicDanceStyle,
  fetchPublicDanceStyles,
  fetchPublicFaq,
  fetchPublicProfessors,
  fetchPublicSchedule,
  fetchSiteImages,
  fetchUpcomingClasses
} from "@/lib/public-site/queries";
import { whatsappHref } from "@/lib/public-site/site";

interface StylePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: StylePageProps): Promise<Metadata> {
  const style = await fetchPublicDanceStyle((await params).slug);
  if (!style) return {};
  const title = `Clases de ${style.name} en La Plata`;
  const description = `${style.tagline} Clases de ${style.name} en M&M Academia de Baile, Calle 3 N.º 164, La Plata. Consultá horarios y niveles por WhatsApp.`;
  const path = `/clases/${style.seoSlug}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, images: [{ url: style.image.src, alt: style.image.alt }] }
  };
}

export default async function StylePage({ params }: StylePageProps) {
  const style = await fetchPublicDanceStyle((await params).slug);
  if (!style) notFound();

  const [branch, styles, professors, schedule, upcoming, generalFaq, images] = await Promise.all([
    fetchPrimaryBranch(),
    fetchPublicDanceStyles(),
    fetchPublicProfessors(),
    fetchPublicSchedule(),
    fetchUpcomingClasses(50),
    fetchPublicFaq(),
    fetchSiteImages()
  ]);

  const teachers = professors.filter((professor) => style.professorSlugs.includes(professor.slug));
  const entries = schedule.entries.filter((entry) => entry.styleSlugs.includes(style.slug));
  const nextClasses = upcoming.filter((item) => item.entry.styleSlugs.includes(style.slug)).slice(0, 3);
  const others = styles.filter((item) => item.slug !== style.slug);
  const message = `Hola, vi la web de M&M Academia y quisiera consultar por las clases de ${style.name}.`;
  const faq = [
    ...style.faq,
    ...generalFaq.filter((item) => /dónde queda|inscribo|experiencia/i.test(item.question))
  ];
  const path = `/clases/${style.seoSlug}`;

  return (
    <>
      <DetailHero
        crumbs={[{ name: "Inicio", href: "/" }, { name: "Clases", href: "/clases" }, { name: style.name }]}
        kicker={`Clase / ${String(styles.indexOf(style) + 1).padStart(2, "0")}`}
        image={style.image}
        title={
          <>
            <span>Clases de</span>{" "}
            <span className={detail.accent}>{style.name}</span>{" "}
            <span>en La Plata</span>
          </>
        }
      >
        <p className={detail.lead}>{style.tagline}</p>
        {style.description.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <DetailFacts
          items={[
            ...(style.levels.length ? [{ term: "Niveles", value: style.levels.join(" · ") }] : []),
            ...(teachers.length
              ? [
                  {
                    term: "Profesores",
                    value: teachers.map((teacher, index) => (
                      <span key={teacher.slug}>
                        {index > 0 ? " · " : ""}
                        <Link href={`/profesores/${teacher.slug}`}>{teacher.displayName}</Link>
                      </span>
                    ))
                  }
                ]
              : []),
            { term: "Dónde", value: `${branch.streetAddress}, ${branch.betweenStreets}, ${branch.locality}` }
          ]}
        />
        <div className={detail.actions}>
          <a
            href={whatsappHref(message)}
            className={`${site.button} ${site.buttonPurple}`}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, `style-${style.slug}`)}
          >
            <WhatsAppIcon />
            Quiero empezar
            <ArrowIcon className={site.buttonArrow} />
          </a>
          <a href="#horarios" className={site.textLink}>
            Ver horarios
          </a>
        </div>
      </DetailHero>

      <ClassesSection
        entries={entries}
        upcoming={nextClasses}
        isPlaceholder={schedule.isPlaceholder}
        context="style"
        whatsappMessage={message}
        title={`Clases de ${style.name}`}
        intro={`Quién da cada clase de ${style.name}, en qué nivel y qué días y horarios se dicta, en el salón de Calle 3.`}
      />

      {teachers.length ? <ProfessorShowcase professors={teachers} styles={styles} count="02" total={null} /> : null}

      <FaqSection items={faq} title={`Preguntas sobre ${style.name}`} />

      {others.length ? (
        <nav aria-label="Otros estilos" className={`${site.container} ${detail.others}`}>
          <p className={`${site.label} ${detail.othersTitle}`}>
            Otros estilos
          </p>
          <ul className={detail.othersList}>
            {others.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/clases/${item.seoSlug}`}
                  className={`${site.textLink} ${detail.othersLink}`}
                >
                  {item.name} <ArrowIcon size={28} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <FinalCta image={images.finalCta} message={message} />

      <JsonLd
        data={jsonLdGraph([
          breadcrumbJsonLd([
            { name: "Inicio", path: "/" },
            { name: "Clases", path: "/clases" },
            { name: style.name, path }
          ]),
          faqJsonLd(faq)
        ])}
      />
    </>
  );
}
