"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DAY_LABELS, WEEK_ORDER, groupByDay } from "@/lib/public-site/schedule-utils";
import type { ScheduleEntry } from "@/lib/public-site/types";
import s from "./weekly-schedule.module.css";

interface WeeklyScheduleProps {
  entries: ScheduleEntry[];
  /** Hide the style filter on a single-style page. */
  showStyleFilter?: boolean;
}

const ALL = "__all";

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function WeeklySchedule({ entries, showStyleFilter = true }: WeeklyScheduleProps) {
  const [style, setStyle] = useState(ALL);
  const [level, setLevel] = useState(ALL);

  const styleOptions = useMemo(
    () => unique(entries.map((entry) => entry.style.slug)).map((slug) => entries.find((entry) => entry.style.slug === slug)!.style),
    [entries]
  );
  const levelOptions = useMemo(() => unique(entries.flatMap((entry) => entry.levels)), [entries]);
  const styleIndex = useMemo(() => new Map(styleOptions.map((option, index) => [option.slug, index % 3])), [styleOptions]);

  const days = WEEK_ORDER.filter((day) => day !== "SUNDAY" || entries.some((entry) => entry.day === "SUNDAY"));
  const filtered = entries.filter(
    (entry) => (style === ALL || entry.style.slug === style) && (level === ALL || entry.levels.includes(level))
  );
  const grouped = groupByDay(filtered, days);

  return (
    <div className={s.schedule}>
      <div className={s.filters} role="group" aria-label="Filtrar horario">
        {showStyleFilter && styleOptions.length > 1 ? (
          <div className={s.filterGroup}>
            <span className={s.filterLabel} id="filtro-estilo">
              Estilo
            </span>
            <div className={s.chips} role="group" aria-labelledby="filtro-estilo">
              <button type="button" className={s.chip} aria-pressed={style === ALL} onClick={() => setStyle(ALL)}>
                Todos
              </button>
              {styleOptions.map((option) => (
                <button
                  key={option.slug}
                  type="button"
                  className={s.chip}
                  aria-pressed={style === option.slug}
                  onClick={() => setStyle(option.slug)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {levelOptions.length > 1 ? (
          <div className={s.filterGroup}>
            <span className={s.filterLabel} id="filtro-nivel">
              Nivel
            </span>
            <div className={s.chips} role="group" aria-labelledby="filtro-nivel">
              <button type="button" className={s.chip} aria-pressed={level === ALL} onClick={() => setLevel(ALL)}>
                Todos
              </button>
              {levelOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={s.chip}
                  aria-pressed={level === option}
                  onClick={() => setLevel(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <p className={s.result} aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "clase" : "clases"} por semana
        </p>
      </div>

      <div className={s.week} style={{ "--days": days.length } as React.CSSProperties}>
        {grouped.map(({ day, entries: dayEntries }) => (
          <section key={day} className={s.day} aria-labelledby={`dia-${day}`}>
            <h3 id={`dia-${day}`} className={s.dayName}>
              <span className={s.dayShort} aria-hidden="true">
                {DAY_LABELS[day].short}
              </span>
              <span className={s.dayLong}>{DAY_LABELS[day].long}</span>
            </h3>
            {dayEntries.length ? (
              <ul className={s.slots}>
                {dayEntries.map((entry) => (
                  <li key={entry.slotId} className={s.slot} data-tone={styleIndex.get(entry.style.slug) ?? 0}>
                    <p className={s.time}>
                      <time>{entry.startTime}</time>
                      <span className={s.timeEnd}>
                        {" "}
                        – <time>{entry.endTime}</time>
                      </span>
                    </p>
                    <p className={s.slotStyle}>
                      <Link href={`/clases/${entry.style.seoSlug}`}>{entry.style.name}</Link>
                    </p>
                    {entry.professors.length ? (
                      <p className={s.slotProf}>{entry.professors.map((professor) => professor.displayName).join(" · ")}</p>
                    ) : null}
                    {entry.levels.length ? <p className={s.slotLevel}>{entry.levels.join(" · ")}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.empty}>Sin clases</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
