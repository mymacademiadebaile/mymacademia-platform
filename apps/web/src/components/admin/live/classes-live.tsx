"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Gift, LayoutGrid, Plus, Search, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { addDays, formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { BillingMode, Branch, CatalogItem, DanceClass, Professor } from "./live-types";
import { ErrorBlock, fetchAllPaginated, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

const dayLabels: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};

type ScheduleDraft = { day: string; startTime: string; endTime: string };
type DraggedSchedule = { classId: string; scheduleIndex: number };
type PendingScheduleMove = DraggedSchedule & { day: string };

const calendarDayByIndex = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const calendarWeekdayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function monthDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const leadingDays = firstDay.getDay();
  const totalCells = Math.ceil((leadingDays + lastDay.getDate()) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(month.getFullYear(), month.getMonth(), index - leadingDays + 1);
    return { date, isCurrentMonth: date.getMonth() === month.getMonth() };
  });
}

function refName<T extends { name?: string; displayName?: string }>(value: T | string): string {
  return typeof value === "string" ? value : value.displayName ?? value.name ?? "Sin nombre";
}

function billingLabel(danceClass: DanceClass) {
  const mode = danceClass.billingMode ?? "MONTHLY";
  if (mode === "FREE") return "Sin cargo";
  if (mode === "PER_CLASS") return "$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR") + " / clase";
  if (mode === "MONTHLY") return "$ " + (danceClass.monthlyPrice ?? 0).toLocaleString("es-AR") + " / mes";
  return "$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR") + " / clase · $ " + (danceClass.monthlyPrice ?? 0).toLocaleString("es-AR") + " / mes";
}

function hourAfter(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  if (hours >= 23) return "23:59";
  return `${String(hours + 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function minutesAt(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeAt(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function scheduleDayFor(date: string) {
  return calendarDayByIndex[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function startOfWeek(date: string) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function ClassesLive({
  embedded = false,
  embeddedView = "CARDS"
}: {
  embedded?: boolean;
  embeddedView?: "CARDS" | "CALENDAR";
}) {
  const router = useRouter();
  const { toast } = useAdminFeedback();
  const [items, setItems] = useState<DanceClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [professorId, setProfessorId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [modal, setModal] = useState(false);
  const [view, setView] = useState<"CARDS" | "CALENDAR">("CALENDAR");
  const [calendarMode, setCalendarMode] = useState<"WEEK" | "DAY" | "MONTH">("WEEK");
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarDate, setCalendarDate] = useState(() => todayInArgentina());
  const [billingMode, setBillingMode] = useState<BillingMode>("PER_CLASS");
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([
    { day: "MONDAY", startTime: "18:00", endTime: "19:00" }
  ]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [draggedSchedule, setDraggedSchedule] = useState<DraggedSchedule | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [movingSchedule, setMovingSchedule] = useState<string | null>(null);
  const [pendingScheduleMove, setPendingScheduleMove] = useState<PendingScheduleMove | null>(null);
  const displayedView = embedded ? embeddedView : view;
  const today = todayInArgentina();
  const weekStart = startOfWeek(today);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (branchId) params.set("branchId", branchId);
      if (professorId) params.set("professorId", professorId);
      if (status !== "ALL") params.set("status", status);

      const [classList, branchList, professorList, catalogList] = await Promise.all([
        apiFetch<DanceClass[]>("/admin/classes?" + params.toString()),
        apiFetch<Branch[]>("/admin/branches"),
        fetchAllPaginated<Professor>("/admin/professors?isActive=true"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);

      setItems(classList);
      setBranches(branchList.filter((item) => item.isActive));
      setProfessors(professorList.filter((item) => item.isActive));
      setCatalogs(catalogList.filter((item) => item.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search, branchId, professorId, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  const disciplines = useMemo(() => catalogs.filter((item) => item.type === "DISCIPLINE"), [catalogs]);
  const segments = useMemo(() => catalogs.filter((item) => item.type === "SEGMENT"), [catalogs]);
  const levels = useMemo(() => catalogs.filter((item) => item.type === "LEVEL"), [catalogs]);
  const visibleMonthDays = useMemo(() => monthDays(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(calendarMonth),
    [calendarMonth]
  );

  const calendarEntriesFor = useCallback((day: string) => (
    items
      .flatMap((danceClass) =>
        danceClass.schedules
          .map((schedule, scheduleIndex) => ({ danceClass, schedule, scheduleIndex }))
          .filter(({ schedule }) => schedule.day === day)
      )
      .sort((a, b) => a.schedule.startTime.localeCompare(b.schedule.startTime))
  ), [items]);

  function changeCalendarMonth(offset: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function startDragging(event: DragEvent<HTMLAnchorElement>, classId: string, scheduleIndex: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${classId}:${scheduleIndex}`);
    setDraggedSchedule({ classId, scheduleIndex });
  }

  function prepareScheduleMove(event: DragEvent<HTMLDivElement>, day: string) {
    event.preventDefault();
    const source = draggedSchedule;
    setDropTarget(null);
    setDraggedSchedule(null);
    if (!source) return;

    const danceClass = items.find((item) => item._id === source.classId);
    const schedule = danceClass?.schedules[source.scheduleIndex];
    if (!danceClass || !schedule) return;
    setPendingScheduleMove({ ...source, day });
  }

  async function confirmScheduleMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pending = pendingScheduleMove;
    if (!pending) return;
    const startTime = String(new FormData(event.currentTarget).get("startTime") ?? "");
    const danceClass = items.find((item) => item._id === pending.classId);
    const schedule = danceClass?.schedules[pending.scheduleIndex];
    if (!danceClass || !schedule || !startTime) return;
    if (schedule.day === pending.day && schedule.startTime === startTime) {
      setPendingScheduleMove(null);
      return;
    }

    const duration = minutesAt(schedule.endTime) - minutesAt(schedule.startTime);
    const targetEnd = minutesAt(startTime) + duration;
    if (targetEnd > 24 * 60 - 1) {
      toast({ title: "Ese horario termina fuera del día", tone: "error" });
      return;
    }
    if (danceClass.schedules.some((item, index) => index !== pending.scheduleIndex && item.day === pending.day && item.startTime === startTime)) {
      toast({ title: "La clase ya tiene un turno en ese horario", tone: "error" });
      return;
    }

    const targetKey = `${danceClass._id}-${pending.scheduleIndex}`;
    setMovingSchedule(targetKey);
    try {
      const updated = await apiFetch<DanceClass>(`/admin/classes/${danceClass._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          schedules: danceClass.schedules.map((item, index) =>
            index === pending.scheduleIndex ? { ...item, day: pending.day, startTime, endTime: timeAt(targetEnd) } : item
          )
        })
      });
      setItems((current) => current.map((item) => (item._id === updated._id ? updated : item)));
      setPendingScheduleMove(null);
      toast({ title: `${danceClass.name} movida a ${dayLabels[pending.day]} ${startTime}` });
    } catch (requestError) {
      toast({ title: "No se pudo mover la clase", description: apiMessage(requestError), tone: "error" });
    } finally {
      setMovingSchedule(null);
    }
  }

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setSchedules((current) =>
      current.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? { ...schedule, ...patch } : schedule
      )
    );
  }

  function addSchedule() {
    setSchedules((current) => [
      ...current,
      {
        day: current.at(-1)?.day ?? "MONDAY",
        startTime: current.at(-1)?.endTime ?? "18:00",
        endTime: hourAfter(current.at(-1)?.endTime ?? "18:00")
      }
    ]);
  }

  function removeSchedule(index: number) {
    setSchedules((current) => current.filter((_, scheduleIndex) => scheduleIndex !== index));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      const danceClass = await apiFetch<DanceClass>("/admin/classes", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          name: form.get("name"),
          professorIds: form.getAll("professorIds"),
          disciplineIds: form.getAll("disciplineIds"),
          segmentIds: form.getAll("segmentIds"),
          levelIds: form.getAll("levelIds"),
          capacity: Number(form.get("capacity")),
          billingMode,
          pricePerClass: Number(form.get("pricePerClass") || 0),
          monthlyPrice: Number(form.get("monthlyPrice") || 0),
          freeTrialEnabled: form.get("freeTrialEnabled") === "on",
          schedules
        })
      });

      setModal(false);
      setSchedules([{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]);
      setBillingMode("PER_CLASS");
      toast({ title: "Clase creada", description: "La configuración quedó guardada." });
      router.push("/admin/classes/" + danceClass._id);
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo crear la clase", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="PLANIFICACIÓN"
          title="Clases y horarios"
          description="Profesores, categorías, agenda, precios y ocupación de cada clase."
          actionLabel="Nueva clase"
          onAction={() => setModal(true)}
        />
      )}

      <div className={styles.filterBar}>
        <div className={styles.searchInline}>
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar clase..." />
        </div>
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">Todas las sedes</option>
          {branches.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
        </select>
        <select value={professorId} onChange={(event) => setProfessorId(event.target.value)}>
          <option value="">Todos los profesores</option>
          {professors.map((item) => <option value={item._id} key={item._id}>{item.displayName}</option>)}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">En pausa</option>
          <option value="ARCHIVED">Archivadas</option>
          <option value="ALL">Todas</option>
        </select>
      </div>

      <div className={styles.viewToolbar}>
        {!embedded && (
          <div>
            <button className={view === "CARDS" ? styles.viewActive : styles.viewButton} onClick={() => setView("CARDS")}>
              <LayoutGrid size={16} /> Tarjetas
            </button>
            <button className={view === "CALENDAR" ? styles.viewActive : styles.viewButton} onClick={() => setView("CALENDAR")}>
              <CalendarDays size={16} /> Calendario
            </button>
          </div>
        )}
        <span>{loading && items.length ? "Actualizando..." : items.length + " clase" + (items.length === 1 ? "" : "s")}</span>
        {embedded && <button className={styles.inlineAction} onClick={() => setModal(true)}><Plus size={15} /> Nueva clase</button>}
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {(items.length > 0 || !loading) && displayedView === "CARDS" && (
        <div className={styles.liveGrid3}>
          {items.length === 0 && <div className={styles.stateBlock}>No hay clases para estos filtros.</div>}
          {items.map((danceClass) => {
            const occupied = danceClass.activeEnrollmentCount ?? 0;
            const occupancy = Math.min(100, Math.round((occupied / danceClass.capacity) * 100));

            return (
              <Link className={styles.cardLink} href={"/admin/classes/" + danceClass._id} key={danceClass._id}>
                <div className={styles.cardTopLine}>
                  <span className={danceClass.status === "ACTIVE" ? styles.pill : styles.pillOff}>
                    {danceClass.status === "ACTIVE" ? "Activa" : danceClass.status === "PAUSED" ? "En pausa" : "Archivada"}
                  </span>
                  <span className={styles.cardDetail}>{occupied}/{danceClass.capacity} alumnos</span>
                </div>
                <strong className={styles.cardTitle}>{danceClass.name}</strong>
                <span className={styles.cardDetail}>{danceClass.professorIds.map((item) => refName(item)).join(", ")}</span>
                <div className={styles.scheduleSummary}>
                  <Clock3 size={15} />
                  <span>{danceClass.schedules.map((schedule) => (dayLabels[schedule.day] ?? schedule.day) + " " + schedule.startTime + "–" + schedule.endTime).join(" · ")}</span>
                </div>
                <div className={styles.classCommercialLine}>
                  <strong>{billingLabel(danceClass)}</strong>
                  {danceClass.freeTrialEnabled && <span><Gift size={12} /> Prueba disponible</span>}
                </div>
                <div className={styles.tagRow}>
                  {[...danceClass.disciplineIds, ...danceClass.segmentIds, ...danceClass.levelIds].map((item) => (
                    <span key={typeof item === "string" ? item : item._id}>{refName(item)}</span>
                  ))}
                </div>
                <div className={styles.occupancyBar}><span style={{ width: occupancy + "%" }} /></div>
                <div className={styles.cardFooterLink}><UsersRound size={15} /> Gestionar clase</div>
              </Link>
            );
          })}
        </div>
      )}

      {(items.length > 0 || !loading) && displayedView === "CALENDAR" && (
        <>
          <div className={styles.calendarControls}>
            <div className={styles.calendarModeSwitch} aria-label="Formato de calendario">
              <button className={calendarMode === "WEEK" ? styles.calendarModeActive : undefined} onClick={() => setCalendarMode("WEEK")}>Semanal</button>
              <button className={calendarMode === "DAY" ? styles.calendarModeActive : undefined} onClick={() => setCalendarMode("DAY")}>Día</button>
              <button className={calendarMode === "MONTH" ? styles.calendarModeActive : undefined} onClick={() => setCalendarMode("MONTH")}>Mensual</button>
            </div>
            {calendarMode === "WEEK" && <span className={styles.calendarDragHint}>Arrastrá una clase al día deseado y elegí la hora al soltarla.</span>}
            {calendarMode === "MONTH" && (
              <div className={styles.monthNavigation}>
                <button type="button" onClick={() => changeCalendarMonth(-1)} aria-label="Mes anterior"><ChevronLeft size={17} /></button>
                <strong>{monthLabel}</strong>
                <button type="button" onClick={() => changeCalendarMonth(1)} aria-label="Mes siguiente"><ChevronRight size={17} /></button>
              </div>
            )}
            {calendarMode === "DAY" && (
              <input
                className={styles.dayPicker}
                aria-label="Elegir día"
                type="date"
                value={calendarDate}
                onChange={(event) => setCalendarDate(event.target.value)}
              />
            )}
          </div>

          {calendarMode === "WEEK" ? (
            <div className={styles.weekCalendarWrap}>
              <div className={styles.weekCalendar}>
                {Object.entries(dayLabels).map(([day, label], index) => {
                  const entries = calendarEntriesFor(day);
                  const date = addDays(weekStart, index);

                  return (
                    <section className={styles.calendarDay} data-past={date < today} data-today={date === today} key={day}>
                      <header>
                        <div>
                          <strong>{label}</strong>
                          <small>{formatDateOnly(date, { day: "numeric", month: "short" })}</small>
                        </div>
                      </header>
                      <div
                        className={styles.calendarDayBody}
                        data-drop-active={dropTarget === day}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setDropTarget(day);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (dropTarget !== day) setDropTarget(day);
                        }}
                        onDrop={(event) => prepareScheduleMove(event, day)}
                      >
                        {entries.length === 0 && <small className={styles.calendarEmpty}>Soltá una clase aquí</small>}
                        {entries.map(({ danceClass, schedule, scheduleIndex }) => {
                          const scheduleKey = `${danceClass._id}-${scheduleIndex}`;
                          return (
                            <Link
                              href={"/admin/classes/" + danceClass._id}
                              className={styles.calendarEvent}
                              data-dragging={draggedSchedule?.classId === danceClass._id && draggedSchedule.scheduleIndex === scheduleIndex}
                              data-moving={movingSchedule === scheduleKey}
                              draggable={!movingSchedule}
                              key={scheduleKey}
                              onDragStart={(event) => startDragging(event, danceClass._id, scheduleIndex)}
                              onDragEnd={() => {
                                setDraggedSchedule(null);
                                setDropTarget(null);
                              }}
                              aria-label={`${danceClass.name}, ${dayLabels[day]} de ${schedule.startTime} a ${schedule.endTime}. Arrastrá para cambiar el día y el horario.`}
                            >
                              <time>{schedule.startTime}–{schedule.endTime}</time>
                              <strong>{danceClass.name}</strong>
                              <small>{danceClass.professorIds.map((item) => refName(item)).join(", ")}</small>
                              <div><span>{danceClass.activeEnrollmentCount ?? 0}/{danceClass.capacity}</span><span>{billingLabel(danceClass)}</span></div>
                              {danceClass.freeTrialEnabled && <em><Gift size={12} /> Prueba</em>}
                            </Link>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : calendarMode === "DAY" ? (() => {
            const day = scheduleDayFor(calendarDate);
            const entries = calendarEntriesFor(day);
            return (
              <section className={styles.dailyCalendar}>
                <header>
                  <div>
                    <strong>{formatDateOnly(calendarDate, { weekday: "long", day: "numeric", month: "long" })}</strong>
                    <span>{entries.length ? `${entries.length} clase${entries.length === 1 ? "" : "s"} programada${entries.length === 1 ? "" : "s"}` : "Sin clases programadas"}</span>
                  </div>
                </header>
                <div className={styles.dailyCalendarBody}>
                  {entries.length === 0 ? (
                    <small className={styles.calendarEmpty}>No hay clases para este día.</small>
                  ) : entries.map(({ danceClass, schedule, scheduleIndex }) => (
                    <Link href={"/admin/classes/" + danceClass._id} className={styles.calendarEvent} key={`${danceClass._id}-${scheduleIndex}`}>
                      <time>{schedule.startTime}–{schedule.endTime}</time>
                      <strong>{danceClass.name}</strong>
                      <small>{danceClass.professorIds.map((item) => refName(item)).join(", ")}</small>
                      <div><span>{danceClass.activeEnrollmentCount ?? 0}/{danceClass.capacity}</span><span>{billingLabel(danceClass)}</span></div>
                      {danceClass.freeTrialEnabled && <em><Gift size={12} /> Prueba</em>}
                    </Link>
                  ))}
                </div>
              </section>
            );
          })() : (
            <div className={styles.monthCalendarWrap}>
              <div className={styles.monthCalendar}>
                {calendarWeekdayLabels.map((label) => <strong className={styles.monthWeekday} key={label}>{label}</strong>)}
                {visibleMonthDays.map(({ date, isCurrentMonth }) => {
                  const entries = calendarEntriesFor(calendarDayByIndex[date.getDay()]);
                  const isToday = date.toDateString() === new Date().toDateString();

                  return (
                    <section className={styles.monthDay} data-outside={!isCurrentMonth} data-today={isToday} key={date.toISOString()}>
                      <header><time dateTime={date.toISOString().slice(0, 10)}>{date.getDate()}</time></header>
                      <div>
                        {entries.map(({ danceClass, schedule }, index) => (
                          <Link href={"/admin/classes/" + danceClass._id} className={styles.monthEvent} key={danceClass._id + "-" + date.getTime() + "-" + index}>
                            <time>{schedule.startTime}</time><span>{danceClass.name}</span>
                          </Link>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {pendingScheduleMove && (() => {
        const danceClass = items.find((item) => item._id === pendingScheduleMove.classId);
        const schedule = danceClass?.schedules[pendingScheduleMove.scheduleIndex];
        if (!danceClass || !schedule) return null;
        return (
          <LiveModal
            open
            title="Confirmar horario"
            description={`${danceClass.name} se moverá a ${dayLabels[pendingScheduleMove.day]}. Elegí la nueva hora de inicio; se conserva la duración actual.`}
            submitting={Boolean(movingSchedule)}
            submitLabel="Guardar cambio"
            onClose={() => setPendingScheduleMove(null)}
            onSubmit={confirmScheduleMove}
          >
            <Field label="Hora de inicio" wide>
              <input name="startTime" type="time" defaultValue={schedule.startTime} required autoFocus />
            </Field>
          </LiveModal>
        );
      })()}

      <LiveModal
        open={modal}
        title="Crear clase"
        description="Definí horarios y cómo se cobra. Por clase es la opción inicial."
        submitting={submitting}
        onClose={() => setModal(false)}
        onSubmit={create}
        submitLabel="Crear clase"
      >
        <Field label="Sede">
          <select name="branchId" required defaultValue="">
            <option value="" disabled>Seleccionar sede</option>
            {branches.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><input name="name" required /></Field>
        <Field label="Profesores" wide>
          <select name="professorIds" multiple size={Math.min(5, Math.max(3, professors.length))} required>
            {professors.map((item) => <option value={item._id} key={item._id}>{item.displayName}</option>)}
          </select>
        </Field>
        <Field label="Disciplinas">
          <select name="disciplineIds" multiple size={4} required>
            {disciplines.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Público">
          <select name="segmentIds" multiple size={3} required>
            {segments.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Niveles">
          <select name="levelIds" multiple size={3} required>
            {levels.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Cupo"><input name="capacity" type="number" min={1} defaultValue={20} required /></Field>
        <Field label="Modalidad de cobro">
          <select value={billingMode} onChange={(event) => setBillingMode(event.target.value as BillingMode)}>
            <option value="PER_CLASS">Por clase</option>
            <option value="MONTHLY">Mensual</option>
            <option value="BOTH">Por clase o mensual</option>
            <option value="FREE">Sin cargo</option>
          </select>
        </Field>
        {(billingMode === "PER_CLASS" || billingMode === "BOTH") && (
          <Field label="Precio por clase (ARS)">
            <input name="pricePerClass" type="number" min={1} step="1" required />
          </Field>
        )}
        {(billingMode === "MONTHLY" || billingMode === "BOTH") && (
          <Field label="Precio mensual (ARS)">
            <input name="monthlyPrice" type="number" min={1} step="1" required />
          </Field>
        )}
        <Field label="Clase de prueba" wide>
          <label className={styles.switchRow}>
            <input name="freeTrialEnabled" type="checkbox" />
            <span>Permitir una clase gratuita de prueba.</span>
          </label>
        </Field>

        <div className={styles.scheduleEditor}>
          <div className={styles.scheduleEditorHeader}>
            <strong>Horarios</strong>
            <button type="button" onClick={addSchedule}><Plus size={14} /> Agregar horario</button>
          </div>
          {schedules.map((schedule, index) => (
            <div className={styles.scheduleEditorRow} key={index}>
              <select value={schedule.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>
                {Object.entries(dayLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <input type="time" value={schedule.startTime} onChange={(event) => updateSchedule(index, { startTime: event.target.value })} />
              <input type="time" value={schedule.endTime} onChange={(event) => updateSchedule(index, { endTime: event.target.value })} />
              <button type="button" disabled={schedules.length === 1} onClick={() => removeSchedule(index)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </LiveModal>
    </>
  );
}
