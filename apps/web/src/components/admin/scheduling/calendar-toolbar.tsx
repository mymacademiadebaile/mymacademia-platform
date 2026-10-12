"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayInArgentina } from "@/lib/dates";
import styles from "./calendar.module.css";
import { VIEW_LABEL, move, rangeLabel, type CalendarFilters, type CalendarOptions, type View } from "./calendar-helpers";
import { SESSION_STATUS_LABEL, type SessionStatus } from "./scheduling-types";

export function CalendarToolbar({
  view,
  anchor,
  from,
  to,
  isCurrentWeek,
  onViewChange,
  onAnchorChange,
  onExtra
}: {
  view: View;
  anchor: string;
  from: string;
  to: string;
  isCurrentWeek: boolean;
  onViewChange: (view: View) => void;
  onAnchorChange: (anchor: string) => void;
  onExtra: () => void;
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.viewSwitch} role="group" aria-label="Vista">
        {(Object.keys(VIEW_LABEL) as View[]).map((item) => (
          <button key={item} aria-pressed={view === item} onClick={() => onViewChange(item)}>
            {VIEW_LABEL[item]}
          </button>
        ))}
      </div>
      <div className={styles.dateNav}>
        <button aria-label="Anterior" onClick={() => onAnchorChange(move(view, anchor, -1))}>
          <ChevronLeft size={16} />
        </button>
        <button onClick={() => onAnchorChange(todayInArgentina())}>Hoy</button>
        <button aria-label="Siguiente" onClick={() => onAnchorChange(move(view, anchor, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
      <span className={styles.rangeLabel}>{rangeLabel(view, anchor, from, to)}</span>
      {isCurrentWeek && <span className={styles.currentWeek}>Semana actual</span>}
      <button className={styles.extraAction} onClick={onExtra}>Clase extra</button>
    </div>
  );
}

export function CalendarFiltersBar({
  filters,
  options,
  onChange
}: {
  filters: CalendarFilters;
  options: CalendarOptions;
  onChange: (filters: CalendarFilters) => void;
}) {
  return (
    <div className={styles.filters}>
      <select aria-label="Profesor" value={filters.professorId} onChange={(event) => onChange({ ...filters, professorId: event.target.value })}>
        <option value="">Todos los profesores</option>
        {options.professors.map((item) => (
          <option key={item._id} value={item._id}>
            {item.displayName}
          </option>
        ))}
      </select>
      <select aria-label="Disciplina" value={filters.disciplineId} onChange={(event) => onChange({ ...filters, disciplineId: event.target.value })}>
        <option value="">Todas las disciplinas</option>
        {options.disciplines.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
      <select aria-label="Clase" value={filters.classId} onChange={(event) => onChange({ ...filters, classId: event.target.value })}>
        <option value="">Todas las clases</option>
        {options.classes.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
      <select aria-label="Pista" value={filters.spaceId} onChange={(event) => onChange({ ...filters, spaceId: event.target.value })}>
        <option value="">Todas las pistas</option>
        {options.spaces.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>
      <select aria-label="Estado" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}>
        <option value="">Todos los estados</option>
        {(Object.keys(SESSION_STATUS_LABEL) as SessionStatus[]).map((item) => (
          <option key={item} value={item}>
            {SESSION_STATUS_LABEL[item]}
          </option>
        ))}
      </select>
    </div>
  );
}
