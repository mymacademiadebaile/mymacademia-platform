"use client";

import type { CSSProperties, DragEvent } from "react";
import styles from "./calendar.module.css";
import { SESSION_STATUS_LABEL, type CalendarSession, type SessionStatus } from "./scheduling-types";

function statusBadge(status: SessionStatus) {
  if (status === "CANCELLED") return styles.badgeDanger;
  if (status === "SUSPENDED" || status === "RESCHEDULED") return styles.badgeWarn;
  if (status === "COMPLETED") return styles.badgeOk;
  return "";
}

export function SessionCard({
  session,
  compact = false,
  draggable,
  dragging,
  color,
  onSelect,
  onDragStart,
  onDragEnd
}: {
  session: CalendarSession;
  compact?: boolean;
  draggable: boolean;
  dragging: boolean;
  color: string | undefined;
  onSelect: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, session: CalendarSession) => void;
  onDragEnd: () => void;
}) {
  const muted = session.status === "CANCELLED" || session.status === "SUSPENDED";
  const style = { "--chip": color } as CSSProperties;
  if (compact) {
    return (
      <button
        className={`${styles.monthChip} ${muted ? styles.cardMuted : ""}`}
        style={style}
        onClick={() => onSelect(session.id)}
        title={`${session.startTime} ${session.class.name}`}
      >
        {session.startTime} {session.class.name}
      </button>
    );
  }
  return (
    <button
      className={`${styles.sessionCard} ${muted ? styles.cardMuted : ""}`}
      style={style}
      draggable={draggable}
      data-dragging={dragging}
      onDragStart={draggable ? (event) => onDragStart(event, session) : undefined}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(session.id)}
      title={draggable ? "Arrastrá para reprogramar esta clase" : undefined}
    >
      <span className={styles.sessionTime}>
        {session.startTime}–{session.endTime}
      </span>
      <span className={styles.sessionName}>{session.class.name}</span>
      <span className={styles.sessionMeta}>
        {[session.class.disciplines.map((item) => item.name).join(", "), session.professors.map((item) => item.displayName).join(", "), session.space?.name]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <span className={styles.badges}>
        {session.status !== "SCHEDULED" && <span className={`${styles.badge} ${statusBadge(session.status)}`}>{SESSION_STATUS_LABEL[session.status]}</span>}
        {session.substitute && <span className={`${styles.badge} ${styles.badgeWarn}`}>Suplente</span>}
        {session.origin !== "REGULAR" && <span className={styles.badge}>{session.origin === "EXTRA" ? "Extra" : "Reprogramada"}</span>}
        <span className={`${styles.badge} ${session.enrolledCount >= session.class.capacity ? styles.badgeDanger : styles.badgeOff}`}>
          {session.enrolledCount}/{session.class.capacity}
        </span>
      </span>
      {session.statusReason && muted && <span className={styles.sessionMeta}>{session.statusReason}</span>}
    </button>
  );
}
