import Link from "next/link";
import type { ReactNode } from "react";
import { PUBLIC_EVENTS, trackAttrs, trackViewAttrs } from "@/lib/public-site/analytics";
import { relativeDayLabel } from "@/lib/public-site/schedule-utils";
import { whatsappHref } from "@/lib/public-site/site";
import type { ScheduleEntry, UpcomingClass } from "@/lib/public-site/types";
import { ArrowIcon, WhatsAppIcon } from "./icons";
import { SectionHeading } from "./section-heading";
import { WeeklySchedule } from "./weekly-schedule";
import site from "./site.module.css";
import s from "./schedule-section.module.css";

interface UpcomingClassesProps {
  items: UpcomingClass[];
}

export function UpcomingClasses({ items }: UpcomingClassesProps) {
  if (items.length === 0) return null;
  return (
    <section className={s.upcoming} aria-labelledby="proximas-title">
      <h3 id="proximas-title" className={s.upcomingTitle}>
        <span className={s.pulse} aria-hidden="true" />
        Próximas clases
      </h3>
      <ol className={s.upcomingList}>
        {items.map((item) => (
          <li key={`${item.date}-${item.entry.slotId}`} className={s.ticket}>
            <p className={s.ticketWhen}>
              <span className={s.ticketDay}>{relativeDayLabel(item)}</span>
              <time className={s.ticketTime} dateTime={`${item.date}T${item.entry.startTime}`}>
                {item.entry.startTime}
              </time>
            </p>
            <div className={s.ticketWhat}>
              <p className={s.ticketStyle}>
                <Link href={`/clases/${item.entry.style.seoSlug}`}>{item.entry.style.name}</Link>
              </p>
              <p className={s.ticketMeta}>
                {[item.entry.levels.join(" · "), item.entry.professors.map((p) => p.displayName).join(" · ")]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface ScheduleSectionProps {
  entries: ScheduleEntry[];
  upcoming: UpcomingClass[];
  isPlaceholder: boolean;
  count?: string;
  total?: string | null;
  headingAs?: "h1" | "h2";
  title?: ReactNode;
  showStyleFilter?: boolean;
}

export function ScheduleSection({
  entries,
  upcoming,
  isPlaceholder,
  count = "05",
  total,
  headingAs = "h2",
  title = "Horario semanal",
  showStyleFilter = true
}: ScheduleSectionProps) {
  return (
    <section
      id="horarios"
      className={s.section}
      aria-labelledby="horarios-title"
      {...trackViewAttrs(PUBLIC_EVENTS.scheduleView)}
    >
      <div className={site.container}>
        <SectionHeading
          count={count}
          label="Horarios"
          titleId="horarios-title"
          tone="light"
          as={headingAs}
          total={total}
          title={title}
        >
          <p>
            {showStyleFilter
              ? "Todas las clases de la semana en el salón de Calle 3. Filtrá por estilo o nivel y encontrá tu día."
              : "Los días y horarios de esta clase en el salón de Calle 3. Filtrá por nivel y encontrá tu día."}
          </p>
          {isPlaceholder ? (
            <p className={s.placeholderNote}>
              <span className={site.placeholderTag}>Horario de ejemplo</span> Pronto publicamos los horarios
              confirmados.
            </p>
          ) : null}
        </SectionHeading>

        <UpcomingClasses items={upcoming} />

        {entries.length ? (
          <WeeklySchedule entries={entries} showStyleFilter={showStyleFilter} />
        ) : (
          <p className={s.empty}>Todavía no hay horarios publicados. Escribinos y te contamos cuándo arranca.</p>
        )}

        <div className={s.foot}>
          <p className={s.footText}>¿Querés confirmar un horario o saber qué nivel te conviene?</p>
          <a
            href={whatsappHref("Hola, vi la web de M&M Academia y quisiera consultar por los horarios.")}
            className={`${site.button} ${site.buttonInk}`}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs(PUBLIC_EVENTS.whatsappClick, "schedule")}
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
