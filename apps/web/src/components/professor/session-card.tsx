"use client";

import Link from "next/link";
import { groupLabel } from "./format";
import type { SessionItem } from "./professor-types";
import { SessionPhaseBadge } from "./professor-ui";
import styles from "./session-card.module.css";

export function ProfessorClassSessionCard({ session, href }: { session: SessionItem; href?: string }) {
  const target = href ?? `/professor/sessions/${session.id}`;
  const group = groupLabel(session.class);
  const cancelled = session.phase === "CANCELLED";
  const summary = session.summary;

  return (
    <article className={styles.card} data-phase={session.phase}>
      <div className={styles.time}>
        <strong>{session.startTime}</strong>
        <span>{session.endTime}</span>
        <span className="sr-only">
          {session.startTime} – {session.endTime}
        </span>
      </div>
      <div className={styles.body}>
        <h3 className={cancelled ? styles.cancelled : undefined}>{session.class.name}</h3>
        <p>
          {[group, session.class.branch.name].filter(Boolean).join(" · ")}
        </p>
        <p className={styles.meta}>
          <span>
            {session.enrolledCount}/{session.class.capacity} alumnos
          </span>
          {summary && !cancelled && (
            <span>
              {summary.paid} pagaron · {summary.pending + summary.overdue} pendientes
            </span>
          )}
        </p>
      </div>
      <div className={styles.side}>
        <SessionPhaseBadge phase={session.phase} />
        <Link href={target} className={styles.link} aria-label={`Ver clase ${session.class.name} de las ${session.startTime}`}>
          Ver clase
        </Link>
      </div>
    </article>
  );
}
