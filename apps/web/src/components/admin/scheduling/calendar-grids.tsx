"use client";

import type { DragEvent, ReactNode } from "react";
import { formatDateOnly } from "@/lib/dates";
import styles from "./calendar.module.css";
import { WEEK_HEAD } from "./calendar-helpers";
import type { CalendarSession, DanceSpace } from "./scheduling-types";

type SessionsByDate = Map<string, CalendarSession[]>;
type RenderCard = (session: CalendarSession, compact?: boolean) => ReactNode;

export function MonthGrid({
  dates,
  byDate,
  anchor,
  today,
  renderCard,
  onPickDay
}: {
  dates: string[];
  byDate: SessionsByDate;
  anchor: string;
  today: string;
  renderCard: RenderCard;
  onPickDay: (date: string) => void;
}) {
  return (
    <div className={styles.monthGrid}>
      {WEEK_HEAD.map((item) => (
        <div key={item} className={styles.monthHead}>
          {item}
        </div>
      ))}
      {dates.map((date) => {
        const sessions = byDate.get(date) ?? [];
        const outside = date.slice(0, 7) !== anchor.slice(0, 7);
        return (
          <div key={date} className={`${styles.monthCell} ${outside ? styles.monthCellMuted : ""} ${date === today ? styles.today : ""}`}>
            <button className={styles.dayNumber} onClick={() => onPickDay(date)}>
              {Number(date.slice(8, 10))}
            </button>
            {sessions.slice(0, 3).map((session) => renderCard(session, true))}
            {sessions.length > 3 && (
              <button className={styles.more} onClick={() => onPickDay(date)}>
                +{sessions.length - 3} más
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function WeekGrid({
  dates,
  byDate,
  today,
  dropDate,
  renderCard,
  onDropDateChange,
  onDropSession
}: {
  dates: string[];
  byDate: SessionsByDate;
  today: string;
  dropDate: string | null;
  renderCard: RenderCard;
  onDropDateChange: (date: string) => void;
  onDropSession: (event: DragEvent<HTMLDivElement>, date: string) => void;
}) {
  return (
    <div className={styles.weekGrid}>
      {dates.map((date) => (
        <div
          key={date}
          className={`${styles.weekColumn} ${date === today ? styles.weekColumnToday : ""}`}
          data-drop-active={dropDate === date}
          data-drop-enabled={date > today}
          onDragEnter={(event) => {
            if (date <= today) return;
            event.preventDefault();
            onDropDateChange(date);
          }}
          onDragOver={(event) => {
            if (date <= today) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dropDate !== date) onDropDateChange(date);
          }}
          onDrop={(event) => onDropSession(event, date)}
        >
          <div className={styles.weekColumnHead}>
            <span>{formatDateOnly(date, { weekday: "short" })}</span>
            <small>{formatDateOnly(date, { day: "numeric", month: "short" })}</small>
          </div>
          {(byDate.get(date) ?? []).map((session) => renderCard(session))}
          {!(byDate.get(date) ?? []).length && <span className={styles.emptyDay}>Sin clases</span>}
        </div>
      ))}
    </div>
  );
}

/** Day view: one column per dance floor, so simultaneous classes are easy to read. */
export function DayBySpace({
  sessions,
  spaces,
  render
}: {
  sessions: CalendarSession[];
  spaces: DanceSpace[];
  render: (session: CalendarSession) => ReactNode;
}) {
  if (!sessions.length) return <p className={styles.emptyDay}>No hay clases este día.</p>;
  const columns = [
    ...spaces
      .filter((space) => sessions.some((session) => session.space?.id === space._id))
      .map((space) => ({ id: space._id, name: space.name })),
    ...(sessions.some((session) => !session.space) ? [{ id: "", name: "Sin pista asignada" }] : [])
  ];
  return (
    <div className={styles.dayGrid}>
      {columns.map((column) => (
        <div key={column.id || "none"} className={styles.weekColumn}>
          <div className={styles.spaceHead}>{column.name}</div>
          {sessions.filter((session) => (session.space?.id ?? "") === column.id).map(render)}
        </div>
      ))}
    </div>
  );
}

export function ListView({
  dates,
  byDate,
  empty,
  renderCard
}: {
  dates: string[];
  byDate: SessionsByDate;
  empty: boolean;
  renderCard: RenderCard;
}) {
  return (
    <div>
      {dates
        .filter((date) => (byDate.get(date) ?? []).length)
        .map((date) => (
          <div key={date} className={styles.listDay}>
            <h3 className={styles.listDayTitle}>{formatDateOnly(date, { weekday: "long", day: "numeric", month: "long" })}</h3>
            <div className={styles.listItems}>{(byDate.get(date) ?? []).map((session) => renderCard(session))}</div>
          </div>
        ))}
      {empty && <p className={styles.emptyDay}>No hay clases en este período con los filtros elegidos.</p>}
    </div>
  );
}
