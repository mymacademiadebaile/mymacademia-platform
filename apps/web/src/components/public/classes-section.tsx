import Link from "next/link";
import type { ReactNode } from "react";
import { PUBLIC_EVENTS, trackAttrs, trackViewAttrs } from "@/lib/public-site/analytics";
import { DAY_LABELS, groupByClass } from "@/lib/public-site/schedule-utils";
import { whatsappHref } from "@/lib/public-site/site";
import type { ScheduleEntry, UpcomingClass } from "@/lib/public-site/types";
import { ArrowIcon, WhatsAppIcon } from "./icons";
import { SectionHeading } from "./section-heading";
import { UpcomingClasses } from "./schedule-section";
import site from "./site.module.css";
import s from "./classes-section.module.css";

interface ClassesSectionProps {
  entries: ScheduleEntry[];
  upcoming?: UpcomingClass[];
  title: ReactNode;
  intro: string;
  /** Show the rhythm on each card (professor page) or the professors (rhythm page). */
  context: "style" | "professor";
  whatsappMessage: string;
  isPlaceholder?: boolean;
  count?: string;
}

/** The classes of one rhythm or one professor, grouped by class with their weekly days and times. */
export function ClassesSection({
  entries,
  upcoming = [],
  title,
  intro,
  context,
  whatsappMessage,
  isPlaceholder = false,
  count = "01"
}: ClassesSectionProps) {
  const groups = groupByClass(entries);

  return (
    <section
      id="horarios"
      className={s.section}
      aria-labelledby="clases-title"
      {...trackViewAttrs(PUBLIC_EVENTS.scheduleView)}
    >
      <div className={site.container}>
        <SectionHeading count={count} label="Clases y horarios" titleId="clases-title" tone="light" total={null} title={title}>
          <p>{intro}</p>
          {isPlaceholder ? (
            <p className={s.note}>
              <span className={site.placeholderTag}>Horario de ejemplo</span>
            </p>
          ) : null}
        </SectionHeading>

        <UpcomingClasses items={upcoming} />

        {groups.length ? (
          <ul className={s.list}>
            {groups.map((group) => (
              <li key={group.classId}>
                <article className={s.card} aria-labelledby={`clase-${group.classId}`}>
                  <header className={s.head}>
                    <h3 id={`clase-${group.classId}`} className={s.name}>
                      {group.className}
                    </h3>
                    {context === "professor" ? (
                      <p className={s.meta}>
                        <Link href={`/clases/${group.style.seoSlug}`}>{group.style.name}</Link>
                      </p>
                    ) : group.professors.length ? (
                      <p className={s.meta}>
                        Con{" "}
                        {group.professors.map((professor, index) => (
                          <span key={professor.slug}>
                            {index > 0 ? " · " : ""}
                            <Link href={`/profesores/${professor.slug}`}>{professor.displayName}</Link>
                          </span>
                        ))}
                      </p>
                    ) : null}
                    {group.levels.length ? <p className={s.levels}>{group.levels.join(" · ")}</p> : null}
                  </header>

                  <ul className={s.slots} aria-label={`Días y horarios de ${group.className}`}>
                    {group.slots.map((slot) => (
                      <li key={slot.slotId} className={s.slot}>
                        <span className={s.day}>
                          <span aria-hidden="true">{DAY_LABELS[slot.day].short}</span>
                          <span className={site.srOnly}>{DAY_LABELS[slot.day].long}</span>
                        </span>
                        <span className={s.time}>
                          <time>{slot.startTime}</time>
                          <span className={s.timeEnd}>
                            {" "}
                            – <time>{slot.endTime}</time>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.empty}>Por ahora no hay clases publicadas. Escribinos y te contamos cuándo arranca la próxima.</p>
        )}

        <div className={s.foot}>
          <p className={s.footText}>¿Querés confirmar un horario o saber qué nivel te conviene?</p>
          <a
            href={whatsappHref(whatsappMessage)}
            className={`${site.button} ${site.buttonInk}`}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, `classes-${context}`)}
          >
            <WhatsAppIcon />
            Consultanos
            <ArrowIcon className={site.buttonArrow} />
          </a>
        </div>
      </div>
    </section>
  );
}
