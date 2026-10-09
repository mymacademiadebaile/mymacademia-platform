"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { addDays, formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { ErrorBlock, Field, LiveModal, LoadingBlock, WebSwitch, fetchAllPaginated } from "../live/live-common";
import type { BillingMode, Branch, CatalogItem, DanceClass, Professor } from "../live/live-types";
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
type PendingSessionMove = { session: CalendarSession; date: string };
type ScheduleDraft = { day: string; startTime: string; endTime: string };

const VIEW_LABEL: Record<View, string> = { month: "Mes", week: "Semana", day: "Día", list: "Lista" };
const WEEK_HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const PALETTE = ["#6d28d9", "#db2777", "#0891b2", "#ea580c", "#16a34a", "#4f46e5", "#ca8a04", "#be123c"];
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};

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

function hourAfter(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours >= 23) return "23:59";
  return `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function MultiSelect({
  options,
  selectedIds,
  onChange,
  placeholder,
  open,
  onOpenChange
}: {
  options: Array<{ _id: string; name?: string; displayName?: string }>;
  selectedIds: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const selectedLabels = options
    .filter((item) => selectedIds.includes(item._id))
    .map((item) => item.displayName ?? item.name ?? "")
    .filter(Boolean);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  return (
    <details className={styles.multiSelect} open={open} onToggle={(event) => onOpenChange(event.currentTarget.open)}>
      <summary>
        <span className={selectedLabels.length ? "" : styles.multiSelectPlaceholder}>
          {selectedLabels.length ? selectedLabels.join(", ") : placeholder}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className={styles.multiSelectOptions}>
        {options.map((item) => {
          const label = item.displayName ?? item.name ?? "Sin nombre";
          return (
            <div key={item._id} className={styles.multiSelectOption}>
              <input id={`class-create-${item._id}`} type="checkbox" checked={selectedIds.includes(item._id)} onChange={() => toggle(item._id)} />
              <label htmlFor={`class-create-${item._id}`}>{label}</label>
            </div>
          );
        })}
      </div>
    </details>
  );
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
  const [classCreateOpen, setClassCreateOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classSaving, setClassSaving] = useState(false);
  const [billingMode, setBillingMode] = useState<BillingMode>("PER_CLASS");
  const [classBranchId, setClassBranchId] = useState("");
  const [classSpaceId, setClassSpaceId] = useState("");
  const [selectedProfessorIds, setSelectedProfessorIds] = useState<string[]>([]);
  const [selectedDisciplineIds, setSelectedDisciplineIds] = useState<string[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [selectedLevelIds, setSelectedLevelIds] = useState<string[]>([]);
  const [freeTrialEnabled, setFreeTrialEnabled] = useState(false);
  const [openMultiSelect, setOpenMultiSelect] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]);
  const [draggedSession, setDraggedSession] = useState<CalendarSession | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [pendingSessionMove, setPendingSessionMove] = useState<PendingSessionMove | null>(null);
  const [movingSession, setMovingSession] = useState(false);
  const [options, setOptions] = useState<{
    branches: Branch[];
    professors: Professor[];
    disciplines: CatalogItem[];
    segments: CatalogItem[];
    levels: CatalogItem[];
    classes: DanceClass[];
    spaces: DanceSpace[];
  }>({ branches: [], professors: [], disciplines: [], segments: [], levels: [], classes: [], spaces: [] });

  const { from, to } = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const classSpaces = useMemo(
    () => options.spaces.filter((item) => item.status === "ACTIVE" && (!classBranchId || item.branchId === classBranchId)),
    [options.spaces, classBranchId]
  );

  // Static references load once; only the calendar range reloads when moving around.
  useEffect(() => {
    void Promise.all([
      apiFetch<Branch[]>("/admin/branches"),
      fetchAllPaginated<Professor>("/admin/professors?isActive=true"),
      apiFetch<CatalogItem[]>("/admin/catalogs"),
      apiFetch<DanceClass[]>("/admin/classes"),
      apiFetch<{ items: DanceSpace[] }>("/admin/spaces")
    ])
      .then(([branches, professors, catalogs, classes, spaces]) =>
        setOptions({
          branches: branches.filter((item) => item.isActive),
          professors: professors.filter((item) => item.isActive),
          disciplines: catalogs.filter((item) => item.type === "DISCIPLINE" && item.isActive),
          segments: catalogs.filter((item) => item.type === "SEGMENT" && item.isActive),
          levels: catalogs.filter((item) => item.type === "LEVEL" && item.isActive),
          classes,
          spaces: spaces.items
        })
      )
      .catch((requestError) => toast({ title: "No pudimos cargar los filtros", description: apiMessage(requestError), tone: "error" }));
  }, [toast]);

  useEffect(() => {
    if (!classBranchId && options.branches[0]) setClassBranchId(options.branches[0]._id);
  }, [classBranchId, options.branches]);

  useEffect(() => {
    if (!classSpaces.some((item) => item._id === classSpaceId)) setClassSpaceId(classSpaces[0]?._id ?? "");
  }, [classSpaceId, classSpaces]);

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

  const visibleItems = useMemo(
    () => (data?.items ?? []).filter((item) => item.status !== "RESCHEDULED" && !(item.status === "CANCELLED" && item.origin === "RESCHEDULED")),
    [data]
  );

  const colorByClass = useMemo(() => {
    const ids = [...new Set(visibleItems.map((item) => item.class.id))].sort();
    return new Map(ids.map((id, index) => [id, PALETTE[index % PALETTE.length]]));
  }, [visibleItems]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarSession[]>();
    for (const item of visibleItems) map.set(item.date, [...(map.get(item.date) ?? []), item]);
    return map;
  }, [visibleItems]);

  const today = data?.today ?? todayInArgentina();
  const isCurrentWeek = view === "week" && from === startOfWeek(today);

  function startDragging(event: DragEvent<HTMLButtonElement>, session: CalendarSession) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", session.id);
    setDraggedSession(session);
  }

  function prepareSessionMove(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const session = draggedSession;
    setDraggedSession(null);
    setDropDate(null);
    if (!session || date <= today || date === session.date) return;
    setPendingSessionMove({ session, date });
  }

  async function confirmSessionMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pending = pendingSessionMove;
    if (!pending) return;
    const form = new FormData(event.currentTarget);
    setMovingSession(true);
    try {
      await apiFetch(`/admin/sessions/${pending.session.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({
          date: pending.date,
          startTime: form.get("startTime"),
          endTime: form.get("endTime"),
          spaceId: pending.session.space?.id ?? null,
          reason: "Cambio de horario desde el calendario"
        })
      });
      setPendingSessionMove(null);
      toast({ title: "Clase reprogramada", tone: "success" });
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo reprogramar la clase", description: apiMessage(requestError), tone: "error" });
    } finally {
      setMovingSession(false);
    }
  }

  function card(session: CalendarSession, compact = false) {
    const muted = session.status === "CANCELLED" || session.status === "SUSPENDED";
    const draggable = !compact && view === "week" && session.status === "SCHEDULED" && session.date > today;
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
      <button
        key={session.id}
        className={`${styles.sessionCard} ${muted ? styles.cardMuted : ""}`}
        style={style}
        draggable={draggable}
        data-dragging={draggedSession?.id === session.id}
        onDragStart={draggable ? (event) => startDragging(event, session) : undefined}
        onDragEnd={() => {
          setDraggedSession(null);
          setDropDate(null);
        }}
        onClick={() => setSelected(session.id)}
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

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setSchedules((current) => current.map((schedule, scheduleIndex) => (scheduleIndex === index ? { ...schedule, ...patch } : schedule)));
  }

  function addSchedule() {
    setSchedules((current) => {
      const last = current.at(-1);
      const startTime = last?.endTime ?? "18:00";
      return [...current, { day: last?.day ?? "MONDAY", startTime, endTime: hourAfter(startTime) }];
    });
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, scheduleIndex) => scheduleIndex !== index));
  }

  async function submitClassCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfessorIds.length || !selectedDisciplineIds.length || !selectedSegmentIds.length || !selectedLevelIds.length) {
      toast({ title: "Completá los datos de la clase", description: "Elegí al menos una opción en profesores, disciplina, público y nivel.", tone: "warning" });
      return;
    }
    const form = new FormData(event.currentTarget);
    setClassSaving(true);
    try {
      const danceClass = await apiFetch<DanceClass>("/admin/classes", {
        method: "POST",
        body: JSON.stringify({
          branchId: classBranchId,
          name: form.get("name"),
          professorIds: selectedProfessorIds,
          disciplineIds: selectedDisciplineIds,
          segmentIds: selectedSegmentIds,
          levelIds: selectedLevelIds,
          capacity: Number(form.get("capacity")),
          billingMode,
          pricePerClass: Number(form.get("pricePerClass") || 0),
          monthlyPrice4: Number(form.get("monthlyPrice4") || 0),
          monthlyPrice8: Number(form.get("monthlyPrice8") || 0),
          freeTrialEnabled,
          schedules,
          defaultSpaceId: classSpaceId || undefined
        })
      });
      setOptions((current) => ({ ...current, classes: [...current.classes, danceClass] }));
      setClassCreateOpen(false);
      setSchedules([{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]);
      setBillingMode("PER_CLASS");
      setSelectedProfessorIds([]);
      setSelectedDisciplineIds([]);
      setSelectedSegmentIds([]);
      setSelectedLevelIds([]);
      setFreeTrialEnabled(false);
      setOpenMultiSelect(null);
      toast({ title: "Clase creada", description: "Ya podés abrirla desde el calendario para gestionarla." });
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo crear la clase", description: apiMessage(requestError), tone: "error" });
    } finally {
      setClassSaving(false);
    }
  }

  const dates: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) dates.push(cursor);

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Consultá clases de cualquier fecha y abrí su registro de asistencia, alumnos y cobros."
        actionLabel="Nueva clase"
        onAction={() => setClassCreateOpen(true)}
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
        {isCurrentWeek && <span className={styles.currentWeek}>Semana actual</span>}
        <button className={styles.extraAction} onClick={() => setExtraOpen(true)}>Clase extra</button>
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
            <div
              key={date}
              className={`${styles.weekColumn} ${date === today ? styles.weekColumnToday : ""}`}
              data-drop-active={dropDate === date}
              data-drop-enabled={date > today}
              onDragEnter={(event) => {
                if (date <= today) return;
                event.preventDefault();
                setDropDate(date);
              }}
              onDragOver={(event) => {
                if (date <= today) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropDate !== date) setDropDate(date);
              }}
              onDrop={(event) => prepareSessionMove(event, date)}
            >
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
          {!visibleItems.length && <p className={styles.emptyDay}>No hay clases en este período con los filtros elegidos.</p>}
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

      {pendingSessionMove && (
        <LiveModal
          open
          title="Confirmar nuevo horario"
          description={`${pendingSessionMove.session.class.name} se moverá al ${formatDateOnly(pendingSessionMove.date, { weekday: "long", day: "numeric", month: "long" })}.`}
          submitting={movingSession}
          submitLabel="Reprogramar clase"
          onClose={() => setPendingSessionMove(null)}
          onSubmit={confirmSessionMove}
        >
          <Field label="Desde">
            <input name="startTime" type="time" defaultValue={pendingSessionMove.session.startTime} required autoFocus />
          </Field>
          <Field label="Hasta">
            <input name="endTime" type="time" defaultValue={pendingSessionMove.session.endTime} required />
          </Field>
        </LiveModal>
      )}

      <LiveModal
        open={classCreateOpen}
        title="Crear clase"
        description="Definí su grupo, modalidad de cobro y horarios. Luego podés editarla desde cualquier clase del calendario."
        submitting={classSaving}
        submitLabel="Crear clase"
        onClose={() => {
          setClassCreateOpen(false);
          setOpenMultiSelect(null);
        }}
        onSubmit={submitClassCreate}
      >
        <Field label="Sede">
          <select name="branchId" required value={classBranchId} onChange={(event) => setClassBranchId(event.target.value)}>
            {options.branches.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Pista">
          <select name="defaultSpaceId" required value={classSpaceId} onChange={(event) => setClassSpaceId(event.target.value)}>
            {classSpaces.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre de la clase" wide><input name="name" required minLength={2} placeholder="Ej.: Bachata inicial" /></Field>
        <div className={`${styles.multiField} ${styles.multiFieldWide}`}>
          <span>Profesores</span>
          <MultiSelect options={options.professors} selectedIds={selectedProfessorIds} onChange={setSelectedProfessorIds} placeholder="Seleccionar profesores" open={openMultiSelect === "professors"} onOpenChange={(open) => setOpenMultiSelect(open ? "professors" : null)} />
        </div>
        <div className={styles.multiField}>
          <span>Disciplinas</span>
          <MultiSelect options={options.disciplines} selectedIds={selectedDisciplineIds} onChange={setSelectedDisciplineIds} placeholder="Seleccionar disciplinas" open={openMultiSelect === "disciplines"} onOpenChange={(open) => setOpenMultiSelect(open ? "disciplines" : null)} />
        </div>
        <div className={styles.multiField}>
          <span>Público</span>
          <MultiSelect options={options.segments} selectedIds={selectedSegmentIds} onChange={setSelectedSegmentIds} placeholder="Seleccionar público" open={openMultiSelect === "segments"} onOpenChange={(open) => setOpenMultiSelect(open ? "segments" : null)} />
        </div>
        <div className={styles.multiField}>
          <span>Niveles</span>
          <MultiSelect options={options.levels} selectedIds={selectedLevelIds} onChange={setSelectedLevelIds} placeholder="Seleccionar niveles" open={openMultiSelect === "levels"} onOpenChange={(open) => setOpenMultiSelect(open ? "levels" : null)} />
        </div>
        <Field label="Cupo"><input className={styles.capacityInput} name="capacity" type="number" min={1} defaultValue={50} required /></Field>
        <Field label="Modalidad de cobro">
          <select value={billingMode} onChange={(event) => setBillingMode(event.target.value as BillingMode)}>
            <option value="PER_CLASS">Por clase</option>
            <option value="MONTHLY">Mensual</option>
            <option value="BOTH">Por clase y mensual</option>
          </select>
        </Field>
        {(billingMode === "PER_CLASS" || billingMode === "BOTH") && <Field label="Precio por clase (ARS)"><input name="pricePerClass" type="number" min={1} step="1" required /></Field>}
        {(billingMode === "MONTHLY" || billingMode === "BOTH") && (
          <>
            <Field label="Mensual · 4 clases (ARS)"><input name="monthlyPrice4" type="number" min={1} step="1" required /></Field>
            <Field label="Mensual · 8 clases (ARS)"><input name="monthlyPrice8" type="number" min={1} step="1" required /></Field>
          </>
        )}
        <Field label="Clase de prueba" wide>
          <div className={styles.trialRow}>
            <span>Permití una primera clase sin cargo.</span>
            <WebSwitch label={freeTrialEnabled ? "Habilitada" : "No habilitada"} checked={freeTrialEnabled} onChange={setFreeTrialEnabled} />
          </div>
        </Field>
        <div className={styles.scheduleEditor}>
          <div className={styles.scheduleEditorHeader}>
            <strong>Horarios</strong>
            <button type="button" onClick={addSchedule}><Plus size={14} /> Agregar horario</button>
          </div>
          {schedules.map((schedule, index) => (
            <div className={styles.scheduleEditorRow} key={index}>
              <select value={schedule.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>{Object.entries(DAY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
              <input type="time" value={schedule.startTime} onChange={(event) => updateSchedule(index, { startTime: event.target.value })} required />
              <input type="time" value={schedule.endTime} onChange={(event) => updateSchedule(index, { endTime: event.target.value })} required />
              <button type="button" disabled={schedules.length === 1} onClick={() => removeSchedule(index)} aria-label="Eliminar horario"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </LiveModal>

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

