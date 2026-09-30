import Image from "next/image";
import Link from "next/link";
import { PUBLIC_EVENTS, trackAttrs } from "@/lib/public-site/analytics";
import type { DanceStyle, PublicProfessor } from "@/lib/public-site/types";
import { ArrowIcon } from "./icons";
import { SectionHeading } from "./section-heading";
import site from "./site.module.css";
import s from "./dance-styles.module.css";

interface DanceStyleCardProps {
  style: DanceStyle;
  index: number;
  professors: PublicProfessor[];
  headingLevel?: "h3" | "h2";
}

export function DanceStyleCard({ style, index, professors, headingLevel: Heading = "h3" }: DanceStyleCardProps) {
  const teachers = professors.filter((professor) => style.professorSlugs.includes(professor.slug));
  const [first, ...rest] = style.name.split(" ");

  return (
    <article className={s.card} aria-labelledby={`style-${style.slug}`}>
      <Image
        src={style.image.src}
        alt={style.image.alt}
        fill
        sizes="(max-width: 767px) 84vw, (max-width: 1023px) 46vw, 45vw"
        quality={65}
        className={s.image}
        style={{ objectPosition: style.image.focus }}
      />
      {/* Makes the whole card a link for mouse and touch; keyboard users get the "Ver clase" link below. */}
      <Link
        href={`/clases/${style.seoSlug}`}
        className={s.overlay}
        tabIndex={-1}
        aria-hidden="true"
        {...trackAttrs(PUBLIC_EVENTS.viewStyle, style.slug)}
      />
      <span className={s.index} aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      {/* Name of the collapsed strip (desktop); the open card shows the heading below. */}
      <span className={s.vertical} aria-hidden="true">
        {style.name}
      </span>
      <div className={s.body}>
        <Heading id={`style-${style.slug}`} className={s.name}>
          <span>{first}</span>{" "}
          {rest.length ? <span>{rest.join(" ")}</span> : null}
        </Heading>
        <p className={s.tagline}>{style.tagline}</p>
        <dl className={s.meta}>
          {style.levels.length ? (
            <div>
              <dt>Niveles</dt>
              <dd>{style.levels.join(" · ")}</dd>
            </div>
          ) : null}
          {teachers.length ? (
            <div>
              <dt>Con</dt>
              <dd>{teachers.map((teacher) => teacher.displayName).join(" · ")}</dd>
            </div>
          ) : null}
        </dl>
        <Link
          href={`/clases/${style.seoSlug}`}
          className={`${site.textLink} ${s.cta}`}
          {...trackAttrs(PUBLIC_EVENTS.viewStyle, style.slug)}
        >
          Ver clase <ArrowIcon />
          <span className={site.srOnly}> de {style.name}</span>
        </Link>
      </div>
    </article>
  );
}

interface DanceStylesProps {
  styles: DanceStyle[];
  professors: PublicProfessor[];
  count?: string;
  total?: string | null;
  headingAs?: "h1" | "h2";
}

export function DanceStyles({ styles, professors, count = "03", total, headingAs = "h2" }: DanceStylesProps) {
  return (
    <section id="estilos" className={s.section} aria-labelledby="estilos-title">
      <div className={site.container}>
        <SectionHeading
          count={count}
          label="Estilos"
          titleId="estilos-title"
          as={headingAs}
          total={total}
          title={
            <>
              Clases de baile <span className={s.titleAccent}>en La Plata</span>
            </>
          }
        >
          <p>
            {styles.length === 1 ? "Un estilo" : `${styles.length} estilos`}, un mismo salón. Elegí por dónde empezar y
            conocé cada clase.
          </p>
        </SectionHeading>
      </div>

      <div className={s.railWrap}>
        <ul className={s.rail}>
          {styles.map((style, index) => (
            <li key={style.id} className={s.item}>
              <DanceStyleCard style={style} index={index} professors={professors} />
            </li>
          ))}
        </ul>
        <div className={s.progress} aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
