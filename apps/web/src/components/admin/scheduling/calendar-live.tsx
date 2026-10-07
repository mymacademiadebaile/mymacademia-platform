"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { addDays, formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { ErrorBlock, Field, LiveModal, LoadingBlock, fetchAllPaginated } from "../live/live-common";
import type { CatalogItem, DanceClass, Professor } from "../live/live-types";
import styles from "./calendar.module.css";
import { SessionDrawer } from "./session-drawer";
import {
  SESSION_STATUS_LABEL,
  type CalendarResponse,
  type CalendarSession,
  type DanceSpace,
  type SessionStatus
} from "./scheduling-types";

type View = "month" | "week" | "day" | "list";

const VIEW_LABEL: Record<View, string> = { month: "Mes", week: "Semana", day: "Día", list: "Lista" };
const WEEK_HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const PALETTE = ["#6d28d9", "#db2777", "#0891b2", "#ea580c", "#16a34a", "#4f46e5", "#ca8a04", "#be123c"];

function weekdayIndex(date: string) {
  // Monday = 0 ... Sunday = 6
  return (new Date(date + "T12:00:00.000Z").getUTCDay() + 6) % 7;
}

function startOfWeek(date: string) {
  return addDays(date, -weekdayIndex(date));
}

function rangeFor(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (view === "list") return { from: anchor, to: addDays(anchor, 13) };
  const first = anchor.slice(0, 7) + "-01";
  const from = startOfWeek(first);
  const nextMonth = new Date(first + "T12:00:00.000Z");
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const last = addDays(nextMonth.toISOString().slice(0, 10), -1);
  return { from, to: addDays(startOfWeek(last), 6) };
}

function move(view: View, anchor: string, direction: 1 | -1) {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "list") return addDays(anchor, 14 * direction);
  const value = new Date(anchor.slice(0, 7) + "-01T12:00:00.000Z");
  value.setUTCMonth(value.getUTCMonth() + direction);
  return value.toISOString().slice(0, 10);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function rangeLabel(view: View, anchor: string, from: string, to: string) {
  if (view === "month") return capitalize(formatDateOnly(anchor, { month: "long", year: "numeric" }));
  if (view === "day") return capitalize(formatDateOnly(anchor, { weekday: "long", day: "numeric", month: "long" }));
  return `${formatDateOnly(from, { day: "numeric", month: "short" })} – ${formatDateOnly(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

function statusBadge(status: SessionStatus) {
  if (status === "CANCELLED") return styles.badgeDanger;
  if (status === "SUSPENDED" || status === "RESCHEDULED") return styles.badgeWarn;
  if (status === "COMPLETED") return styles.badgeOk;
  return "";
}

export function CalendarLive() {
  const { toast } = useAdminFeedback();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayInArgentina());
  const [filters, setFilters] = useState({ professorId: "", disciplineId: "", classId: "", spaceId: "", status: "" });
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<{
    professors: Professor[];
    disciplines: CatalogItem[];
    classes: DanceClass[];
    spaces: DanceSpace[];
  }>({ professors: [], disciplines: [], classes: [], spaces: [] });

  const { from, to } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  // Static references load once; only the calendar range reloads when moving around.
  useEffect(() => {
    void Promise.all([
      fetchAllPaginated<Professor>("/admin/professors?isActive=true"),
      apiFetch<CatalogItem[]>("/admin/catalogs"),
      apiFetch<DanceClass[]>("/admin/classes"),
      apiFetch<{ items: DanceSpace[] }>("/admin/spaces")
    ])
      .then(([professors, catalogs, classes, spaces]) =>
        setOptions({
          professors,
          disciplines: catalogs.filter((item) => item.type === "DISCIPLINE" && item.isActive),
          classes,
          spaces: spaces.items
        })
      )
      .catch((requestError) => toast({ title: "No pudimos cargar los filtros", description: apiMessage(requestError), tone: "error" }));
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to });
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      setData(await apiFetch<CalendarResponse>("/admin/calendar?" + params.toString()));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [from, to, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const colorByClass = useMemo(() => {
    const ids = [...new Set((data?.items ?? []).map((item) => item.class.id))].sort();
    return new Map(ids.map((id, index) => [id, PALETTE[index % PALETTE.length]]));
  }, [data]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const item of data?.items ?? []) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [data]);

  const today = data?.today ?? todayInArgentina();

  function card(session: CalendarSession, compact = false) {
    const muted = session.status === "CANCELLED" || session.status === "SUSPENDED";
    const style = { "--chip": colorByClass.get(session.class.id) } as React.CSSProperties;
    if (compact) {
      return (
        <button
          key={session.id}
          className={`${styles.monthChip} ${muted ? styles.cardMuted : ""}`}
          style={style}
          onClick={() => setSelected(session.id)}
          title={`${session.startTime} ${session.class.name}`}
        >
          {session.startTime} {session.class.name}
        </button>
      );
    }
    return (
      <button key={session.id} className={`${styles.sessionCard} ${muted ? styles.cardMuted : ""}`} style={style} onClick={() => setSelected(session.id)}>
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

  async function submitExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      await apiFetch("/admin/sessions", {
        method: "POST",
        body: JSON.stringify({
          classId: form.get("classId"),
          date: form.get("date"),
          startTime: form.get("startTime"),
          endTime: form.get("endTime"),
          spaceId: form.get("spaceId") || null,
          notes: form.get("notes") || undefined
        })
      });
      toast({ title: "Clase extra creada", tone: "success" });
      setExtraOpen(false);
      formElement.reset();
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo crear la clase", description: apiMessage(requestError), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) dates.push(cursor);

  return (
    <>
      <PageHeader
        eyebrow="OPERACIÓN"
        title="Calendario"
        description="Todas las clases de la academia: asistencia, cobros, suspensiones y cambios desde un solo lugar."
        actionLabel="Clase extra"
        onAction={() => setExtraOpen(true)}
      />

      <div className={styles.toolbar}>
        <div className={styles.viewSwitch} role="group" aria-label="Vista">
          {(Object.keys(VIEW_LABEL) as View[]).map((item) => (
            <button key={item} aria-pressed={view === item} onClick={() => setView(item)}>
              {VIEW_LABEL[item]}
            </button>
          ))}
        </div>
        <div className={styles.dateNav}>
          <button aria-label="Anterior" onClick={() => setAnchor(move(view, anchor, -1))}>
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setAnchor(todayInArgentina())}>Hoy</button>
          <button aria-label="Siguiente" onClick={() => setAnchor(move(view, anchor, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <span className={styles.rangeLabel}>{rangeLabel(view, anchor, from, to)}</span>
      </div>

      <div className={styles.filters}>
        <select aria-label="Profesor" value={filters.professorId} onChange={(event) => setFilters({ ...filters, professorId: event.target.value })}>
          <option value="">Todos los profesores</option>
          {options.professors.map((item) => (
            <option key={item._id} value={item._id}>
              {item.displayName}
            </option>
          ))}
        </select>
        <select aria-label="Disciplina" value={filters.disciplineId} onChange={(event) => setFilters({ ...filters, disciplineId: event.target.value })}>
          <option value="">Todas las disciplinas</option>
          {options.disciplines.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        <select aria-label="Clase" value={filters.classId} onChange={(event) => setFilters({ ...filters, classId: event.target.value })}>
          <option value="">Todas las clases</option>
          {options.classes.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        <select aria-label="Pista" value={filters.spaceId} onChange={(event) => setFilters({ ...filters, spaceId: event.target.value })}>
          <option value="">Todas las pistas</option>
          {options.spaces.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
        <select aria-label="Estado" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">Todos los estados</option>
          {(Object.keys(SESSION_STATUS_LABEL) as SessionStatus[]).map((item) => (
            <option key={item} value={item}>
              {SESSION_STATUS_LABEL[item]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : loading && !data ? (
        <LoadingBlock label="Cargando calendario..." />
      ) : view === "month" ? (
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
                <button
                  className={styles.dayNumber}
                  onClick={() => {
                    setAnchor(date);
                    setView("day");
                  }}
                >
                  {Number(date.slice(8, 10))}
                </button>
                {sessions.slice(0, 3).map((session) => card(session, true))}
                {sessions.length > 3 && (
                  <button
                    className={styles.more}
                    onClick={() => {
                      setAnchor(date);
                      setView("day");
                    }}
                  >
                    +{sessions.length - 3} más
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : view === "week" ? (
        <div className={styles.weekGrid}>
          {dates.map((date) => (
            <div key={date} className={`${styles.weekColumn} ${date === today ? styles.weekColumnToday : ""}`}>
              <div className={styles.weekColumnHead}>
                <span>{formatDateOnly(date, { weekday: "short" })}</span>
                <small>{formatDateOnly(date, { day: "numeric", month: "short" })}</small>
              </div>
              {(byDate.get(date) ?? []).map((session) => card(session))}
              {!(byDate.get(date) ?? []).length && <span className={styles.emptyDay}>Sin clases</span>}
            </div>
          ))}
        </div>
      ) : view === "day" ? (
        <DayBySpace sessions={byDate.get(anchor) ?? []} spaces={options.spaces} render={(session) => card(session)} />
      ) : (
        <div>
          {dates
            .filter((date) => (byDate.get(date) ?? []).length)
            .map((date) => (
              <div key={date} className={styles.listDay}>
                <h3 className={styles.listDayTitle}>{formatDateOnly(date, { weekday: "long", day: "numeric", month: "long" })}</h3>
                <div className={styles.listItems}>{(byDate.get(date) ?? []).map((session) => card(session))}</div>
              </div>
            ))}
          {!data?.items.length && <p className={styles.emptyDay}>No hay clases en este período con los filtros elegidos.</p>}
        </div>
      )}

      {selected && (
        <SessionDrawer
          sessionId={selected}
          spaces={options.spaces}
          professors={options.professors}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
        />
      )}

      <LiveModal
        open={extraOpen}
        title="Clase extraordinaria"
        description="Una fecha adicional para todo el grupo, fuera de su horario habitual. Se controlan pista y profesores."
        submitting={saving}
        submitLabel="Crear clase"
        onClose={() => setExtraOpen(false)}
        onSubmit={submitExtra}
      >
        <Field label="Clase" wide>
          <select name="classId" required>
            {options.classes
              .filter((item) => item.status === "ACTIVE" || item.status === "PAUSED")
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input name="date" type="date" min={todayInArgentina()} defaultValue={anchor >= todayInArgentina() ? anchor : todayInArgentina()} required />
        </Field>
        <Field label="Pista">
          <select name="spaceId" defaultValue="">
            <option value="">Sin pista</option>
            {options.spaces.filter((item) => item.status === "ACTIVE").map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde">
          <input name="startTime" type="time" required />
        </Field>
        <Field label="Hasta">
          <input name="endTime" type="time" required />
        </Field>
        <Field label="Notas" wide>
          <input name="notes" maxLength={1000} />
        </Field>
      </LiveModal>
    </>
  );
}

/** Day view: one column per dance floor, so simultaneous classes are easy to read. */
function DayBySpace({
  sessions,
  spaces,
  render
}: {
  sessions: CalendarSession[];
  spaces: DanceSpace[];
  render: (session: CalendarSession) => React.ReactNode;
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

