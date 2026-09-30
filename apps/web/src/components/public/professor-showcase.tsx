import Image from "next/image";
import Link from "next/link";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import type { DanceStyle, PublicProfessor } from "@/lib/public-site/types";
import { ArrowIcon } from "./icons";
import { SectionHeading } from "./section-heading";
import site from "./site.module.css";
import s from "./professor-showcase.module.css";

interface ProfessorCardProps {
  professor: PublicProfessor;
  index: number;
  styles: DanceStyle[];
}

function ProfessorCard({ professor, index, styles }: ProfessorCardProps) {
  const disciplines = styles.filter((style) => professor.disciplines.includes(style.slug));

  return (
    <article className={s.card} aria-labelledby={`prof-${professor.slug}`}>
      <figure className={s.figure}>
        <Image
          src={professor.avatar.src}
          alt={professor.avatar.alt}
          fill
          sizes="(max-width: 767px) 80vw, (max-width: 1279px) 45vw, 30vw"
          quality={65}
          className={s.photo}
          style={{ objectPosition: professor.avatar.focus }}
        />
        <span className={s.frameNo} aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        {professor.isPlaceholder ? <span className={`${site.placeholderTag} ${s.tag}`}>Perfil de ejemplo</span> : null}
      </figure>

      <div className={s.text}>
        <h3 id={`prof-${professor.slug}`} className={s.name}>
          <span>{professor.firstName}</span>{" "}
          {professor.lastName ? <span className={s.lastName}>{professor.lastName}</span> : null}
        </h3>
        {disciplines.length ? (
          <p className={s.disciplines}>{disciplines.map((style) => style.name).join(" / ")}</p>
        ) : null}
        <p className={s.quote}>{professor.bioShort}</p>
        <div className={s.links}>
          <Link
            href={`/profesores/${professor.slug}`}
            className={site.textLink}
            {...trackAttrs(PUBLIC_EVENTS.viewProfessor, professor.slug)}
          >
            Conocer a {professor.firstName} <ArrowIcon />
          </Link>
          {professor.instagram ? (
            <a className={s.instagram} href={professor.instagram} target="_blank" rel="noopener noreferrer">
              Instagram<span className={site.srOnly}> de {professor.displayName}</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

interface ProfessorShowcaseProps {
  professors: PublicProfessor[];
  styles: DanceStyle[];
  count?: string;
  total?: string | null;
  headingAs?: "h1" | "h2";
}

export function ProfessorShowcase({ professors, styles, count = "04", total, headingAs = "h2" }: ProfessorShowcaseProps) {
  return (
    <section id="profesores" className={s.section} aria-labelledby="profesores-title">
      <p className={s.backdrop} aria-hidden="true">
        Profes
      </p>
      <div className={site.container}>
        <SectionHeading
          count={count}
          label="Profesores"
          titleId="profesores-title"
          as={headingAs}
          total={total}
          title="Quién te enseña"
        >
          <p>Las personas que están al frente de cada clase. Conocé su estilo y su forma de enseñar antes de venir.</p>
        </SectionHeading>

        <ul className={s.grid}>
          {professors.map((professor, index) => (
            <li key={professor.id} className={s.item}>
              <ProfessorCard professor={professor} index={index} styles={styles} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
