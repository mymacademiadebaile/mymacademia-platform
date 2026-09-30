"use client";

import { CalendarClock, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { BILLING_MODE_LABEL, formatLongDate, groupLabel, priceLabel, scheduleDays } from "../format";
import type { ClassSummary } from "../professor-types";
import { Chip } from "../professor-ui";
import styles from "./professor-class-card.module.css";

export function ProfessorClassCard({ item }: { item: ClassSummary }) {
  const percent = item.capacity > 0 ? Math.min(100, Math.round((item.enrolledCount / item.capacity) * 100)) : 0;
  const group = groupLabel(item);

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <h2>{item.name}</h2>
        <span className={styles.status} data-active={item.status === "ACTIVE"}>
          {item.status === "ACTIVE" ? "Activa" : "Inactiva"}
        </span>
      </header>

      <div className={styles.chips}>
        {group && <Chip>{group}</Chip>}
        {item.disciplines.map((discipline) => (
          <Chip key={discipline.id}>{discipline.name}</Chip>
        ))}
        {item.freeTrialEnabled && <Chip>Prueba gratis</Chip>}
      </div>

      <p className={styles.line}>
        <MapPin size={16} aria-hidden /> {item.branch.name}
      </p>
      <div className={styles.line}>
        <CalendarClock size={16} aria-hidden />
        <div>
          <strong>{scheduleDays(item.schedules)}</strong>
          <ul className={styles.slots}>
            {item.schedules.map((slot, index) => (
              <li key={`${slot.day}-${index}`}>
                {slot.startTime} – {slot.endTime}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.capacity}>
        <p className={styles.line}>
          <Users size={16} aria-hidden /> {item.enrolledCount} / {item.capacity} alumnos
        </p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={item.capacity}
          aria-valuenow={item.enrolledCount}
          aria-label="Cupo ocupado"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      <p className={styles.billing}>
        {BILLING_MODE_LABEL[item.billingMode]} · <strong>{priceLabel(item)}</strong>
      </p>

      <footer className={styles.foot}>
        <span className={styles.next}>
          {item.nextOccurrence
            ? `Próxima: ${formatLongDate(item.nextOccurrence.date)} ${item.nextOccurrence.startTime}`
            : "Sin próximas clases"}
        </span>
        <Link href={`/professor/classes/${item.id}`} className={styles.link}>
          Ver detalle
        </Link>
      </footer>
    </article>
  );
}
