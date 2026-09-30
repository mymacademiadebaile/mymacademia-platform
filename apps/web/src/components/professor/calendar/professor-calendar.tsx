"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  addDaysKey,
  formatLongDate,
  formatMonth,
  formatWeekdayShort,
  parseDateKey,
  startOfWeekKey,
  toDateKey
} from "../format";
import type { CalendarData, DashboardData, SessionItem } from "../professor-types";
import { ErrorState, PageSkeleton, ProfessorPageHeader, SegmentedControl, uiStyles } from "../professor-ui";
import { ProfessorClassSessionCard } from "../session-card";
import { useProfessorData } from "../use-professor-data";
import styles from "./professor-calendar.module.css";

type View = "month" | "week" | "day";

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
const HOUR_HEIGHT = 64;
const MIN_EVENT_HEIGHT = 30;
const TONES = 4;

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function toneOf(session: SessionItem) {
  const key = session.class.disciplines[0]?.id ?? session.class.id;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TONES;
}

function monthStart(date: string) {
  const { year, month } = parseDateKey(date);
  return toDateKey(year, month, 1);
}

function rangeFor(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeekKey(anchor);
    return { from, to: addDaysKey(from, 6) };
  }
  const from = startOfWeekKey(monthStart(anchor));
  return { from, to: addDaysKey(from, 41) };
}

function shiftAnchor(view: View, anchor: string, direction: 1 | -1) {
  if (view === "day") return addDaysKey(anchor, direction);
  if (view === "week") return addDaysKey(anchor, 7 * direction);
  const { year, month } = parseDateKey(anchor);
  return toDateKey(year, month + direction, 1);
}

function titleFor(view: View, anchor: string) {
  if (view === "day") return formatLongDate(anchor);
  if (view === "month") {
    const { year, month } = parseDateKey(anchor);
    return formatMonth(`${year}-${String(month).padStart(2, "0")}`);
  }
  const start = parseDateKey(startOfWeekKey(anchor));
  const end = parseDateKey(addDaysKey(startOfWeekKey(anchor), 6));
  return start.month === end.month
    ? `Semana del ${start.day} al ${end.day} de ${MONTH_NAMES[end.month - 1]}`
    : `Semana del ${start.day} de ${MONTH_NAMES[start.month - 1]} al ${end.day} de ${MONTH_NAMES[end.month - 1]}`;
}

function emptyText(view: View) {
  if (view === "week") return "No hay clases programadas esta semana.";
  if (view === "day") return "No hay clases programadas este día.";
  return "No hay clases programadas este mes.";
}

/* ---------- Time grid (desktop week/day) ---------- */

type Positioned = { session: SessionItem; lane: number; lanes: number };

function layoutDay(sessions: SessionItem[]): Positioned[] {
  const sorted = [...sessions].sort(
    (a, b) => minutes(a.startTime) - minutes(b.startTime) || minutes(a.endTime) - minutes(b.endTime)
  );
  const result: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const session of sorted) {
    const start = minutes(session.startTime);
    const end = Math.max(minutes(session.endTime), start + 30);
    if (cluster.length && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((value) => value <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ session, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

function EventBlock({ item, startHour }: { item: Positioned; startHour: number }) {
  const { session } = item;
  const start = minutes(session.startTime);
  const end = Math.max(minutes(session.endTime), start + 30);
  const cancelled = session.phase === "CANCELLED";
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT - 2, MIN_EVENT_HEIGHT);
  const discipline = session.class.disciplines.map((value) => value.name).join(", ");

  return (
    <Link
      href={`/professor/sessions/${session.id}`}
      className={styles.event}
      data-tone={toneOf(session)}
      data-cancelled={cancelled}
      data-live={session.phase === "IN_PROGRESS"}
      style={{
        top: ((start - startHour * 60) / 60) * HOUR_HEIGHT + 1,
        height,
        left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
        width: `calc(${100 / item.lanes}% - 4px)`
      }}
      aria-label={`${session.startTime} ${session.class.name}${cancelled ? ", cancelada" : ""}`}
    >
      <strong>
        {session.startTime} {session.class.name}
      </strong>
      {cancelled && <span className={styles.cancelTag}>Cancelada</span>}
      {height >= 48 && discipline && <span>{discipline}</span>}
      {height >= 70 && <span>{session.class.branch.name}</span>}
      {height >= 90 && <span>{session.enrolledCount} alumnos</span>}
    </Link>
  );
}

function TimeGrid({
  days,
  byDate,
  today
}: {
  days: string[];
  byDate: Map<string, SessionItem[]>;
  today: string;
}) {
  const all = days.flatMap((day) => byDate.get(day) ?? []);
  const startHour = all.length ? Math.max(0, Math.min(8, Math.floor(Math.min(...all.map((s) => minutes(s.startTime))) / 60))) : 8;
  const endHour = all.length ? Math.min(24, Math.max(20, Math.ceil(Math.max(...all.map((s) => minutes(s.endTime))) / 60))) : 20;
  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

  return (
    <div className={styles.gridScroll}>
      <div className={styles.timeGrid} style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className={styles.corner} />
        {days.map((day) => (
          <div key={day} className={styles.dayHead} data-today={day === today}>
            <span>{formatWeekdayShort(day)}</span>
            <strong>{parseDateKey(day).day}</strong>
          </div>
        ))}
        <div className={styles.hours}>
          {hours.map((hour) => (
            <span key={hour} style={{ height: HOUR_HEIGHT }}>
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className={styles.dayCol}
            data-today={day === today}
            style={{ height: hours.length * HOUR_HEIGHT }}
          >
            {layoutDay(byDate.get(day) ?? []).map((item) => (
              <EventBlock key={item.session.id} item={item} startHour={startHour} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Agenda (mobile week/day) ---------- */

function Agenda({
  days,
  byDate,
  today,
  showEmptyDays
}: {
  days: string[];
  byDate: Map<string, SessionItem[]>;
  today: string;
  showEmptyDays: boolean;
}) {
  const visible = days.filter((day) => showEmptyDays || (byDate.get(day)?.length ?? 0) > 0);
  return (
    <div className={styles.agenda}>
      {visible.map((day) => {
        const sessions = byDate.get(day) ?? [];
        return (
          <section key={day} className={styles.agendaDay}>
            <h3 data-today={day === today}>
              {formatLongDate(day)}
              {day === today && <span> · Hoy</span>}
            </h3>
            {sessions.length ? (
              <div className={styles.agendaList}>
                {sessions.map((session) => (
                  <ProfessorClassSessionCard key={session.id} session={session} />
                ))}
              </div>
            ) : (
              <p className={styles.agendaEmpty}>No tenés clases este día.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Month ---------- */

function MonthGrid({
  from,
  anchor,
  byDate,
  today,
  onOpenDay
}: {
  from: string;
  anchor: string;
  byDate: Map<string, SessionItem[]>;
  today: string;
  onOpenDay: (day: string) => void;
}) {
  const days = Array.from({ length: 42 }, (_, index) => addDaysKey(from, index));
  const anchorMonth = parseDateKey(anchor).month;

  return (
    <div className={styles.monthWrap}>
      <div className={styles.monthHead} aria-hidden>
        {days.slice(0, 7).map((day) => (
          <span key={day}>{formatWeekdayShort(day)}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {days.map((day) => {
          const sessions = byDate.get(day) ?? [];
          const shown = sessions.slice(0, 3);
          const extra = sessions.length - shown.length;
          const parsed = parseDateKey(day);
          return (
            <div
              key={day}
              className={styles.monthCell}
              data-today={day === today}
              data-outside={parsed.month !== anchorMonth}
            >
              <button
                type="button"
                className={styles.monthDay}
                onClick={() => onOpenDay(day)}
                aria-label={`${formatLongDate(day)}, ${sessions.length} ${sessions.length === 1 ? "clase" : "clases"}`}
              >
                {parsed.day}
              </button>
              <ul className={styles.monthEvents}>
                {shown.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/professor/sessions/${session.id}`}
                      className={styles.monthChip}
                      data-tone={toneOf(session)}
                      data-cancelled={session.phase === "CANCELLED"}
                    >
                      {session.startTime} {session.class.name}
                    </Link>
                  </li>
                ))}
                {extra > 0 && (
                  <li>
                    <button type="button" className={styles.more} onClick={() => onOpenDay(day)}>
                      +{extra} más
                    </button>
                  </li>
                )}
              </ul>
              {sessions.length > 0 && (
                <span className={styles.monthCount} aria-hidden>
                  {sessions.length}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Main ---------- */

export function ProfessorCalendar() {
  const dashboard = useProfessorData<DashboardData>("/dashboard");
  const todayFromApi = dashboard.data?.today;

  const [view, setView] = useState<View>("week");
  const [anchorState, setAnchorState] = useState<string | null>(null);
  const anchor = anchorState ?? todayFromApi ?? null;

  const range = anchor ? rangeFor(view, anchor) : null;
  const path = range ? `/calendar?from=${range.from}&to=${range.to}` : null;
  const calendar = useProfessorData<CalendarData>(path);

  const [last, setLast] = useState<CalendarData | undefined>(undefined);
  useEffect(() => {
    if (calendar.data) setLast(calendar.data);
  }, [calendar.data]);
  const shown = calendar.data ?? last;
  const today = shown?.today ?? todayFromApi ?? "";

  const byDate = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    for (const item of shown?.items ?? []) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [shown]);

  if (!anchor || !range) {
    if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
    return <PageSkeleton blocks={3} />;
  }
  if (!shown) {
    if (calendar.error) return <ErrorState message={calendar.error} onRetry={calendar.reload} />;
    return <PageSkeleton blocks={3} />;
  }

  const days =
    view === "day" ? [anchor] : Array.from({ length: 7 }, (_, index) => addDaysKey(range.from, index));
  const visibleDays = view === "month" ? Array.from({ length: 42 }, (_, i) => addDaysKey(range.from, i)) : days;
  const total = visibleDays.reduce((sum, day) => sum + (byDate.get(day)?.length ?? 0), 0);
  const stale = shown.from !== range.from || shown.to !== range.to;

  const openDay = (day: string) => {
    setAnchorState(day);
    setView("day");
  };

  return (
    <div className={styles.page}>
      <ProfessorPageHeader
        title="Calendario"
        subtitle={<span aria-live="polite">{titleFor(view, anchor)}</span>}
        refreshing={calendar.refreshing || stale}
        actions={
          <div className={styles.toolbar}>
            <SegmentedControl<View>
              label="Vista del calendario"
              value={view}
              onChange={setView}
              options={[
                { value: "month", label: "Mes" },
                { value: "week", label: "Semana" },
                { value: "day", label: "Día" }
              ]}
            />
            <div className={styles.nav}>
              <button
                type="button"
                className={uiStyles.secondaryButton}
                onClick={() => setAnchorState(shiftAnchor(view, anchor, -1))}
                aria-label="Período anterior"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={uiStyles.secondaryButton}
                onClick={() => setAnchorState(today || null)}
              >
                Hoy
              </button>
              <button
                type="button"
                className={uiStyles.secondaryButton}
                onClick={() => setAnchorState(shiftAnchor(view, anchor, 1))}
                aria-label="Período siguiente"
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          </div>
        }
      />

      {calendar.error && <ErrorState message={calendar.error} onRetry={calendar.reload} />}
      {total === 0 && !stale && !calendar.refreshing && (
        <p className={styles.emptyNote} role="status">
          {emptyText(view)}
        </p>
      )}

      <div className={styles.body} data-stale={stale}>
        {view === "month" ? (
          <MonthGrid from={range.from} anchor={anchor} byDate={byDate} today={today} onOpenDay={openDay} />
        ) : (
          <>
            <div className={styles.desktopOnly}>
              <TimeGrid days={days} byDate={byDate} today={today} />
            </div>
            <div className={styles.mobileOnly}>
              <Agenda days={days} byDate={byDate} today={today} showEmptyDays={view === "day"} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

