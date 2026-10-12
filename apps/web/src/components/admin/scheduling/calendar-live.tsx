"use client";

import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { ErrorBlock, Field, LiveModal, LoadingBlock, fetchAllPaginated } from "../live/live-common";
import type { Branch, CatalogItem, DanceClass, Professor } from "../live/live-types";
import { SessionDrawer } from "./session-drawer";
import type { CalendarResponse, CalendarSession, DanceSpace } from "./scheduling-types";
import { DayBySpace, ListView, MonthGrid, WeekGrid } from "./calendar-grids";
import {
  EMPTY_FILTERS,
  EMPTY_OPTIONS,
  PALETTE,
  datesBetween,
  rangeFor,
  startOfWeek,
  type PendingSessionMove,
  type View
} from "./calendar-helpers";
import { CalendarFiltersBar, CalendarToolbar } from "./calendar-toolbar";
import { ClassCreateModal } from "./class-create-modal";
import { ExtraSessionModal } from "./extra-session-modal";
import { SessionCard } from "./session-card";

export function CalendarLive() {
  const { toast } = useAdminFeedback();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(todayInArgentina());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [classCreateOpen, setClassCreateOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [draggedSession, setDraggedSession] = useState<CalendarSession | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [pendingSessionMove, setPendingSessionMove] = useState<PendingSessionMove | null>(null);
  const [movingSession, setMovingSession] = useState(false);
  const [options, setOptions] = useState(EMPTY_OPTIONS);

  const { from, to } = useMemo(() => rangeFor(view, anchor), [view, anchor]);

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
  const dates = datesBetween(from, to);

  function startDragging(event: DragEvent<HTMLButtonElement>, session: CalendarSession) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", session.id);
    setDraggedSession(session);
  }

  function stopDragging() {
    setDraggedSession(null);
    setDropDate(null);
  }

  function prepareSessionMove(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const session = draggedSession;
    stopDragging();
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

  function renderCard(session: CalendarSession, compact = false) {
    return (
      <SessionCard
        key={session.id}
        session={session}
        compact={compact}
        draggable={!compact && view === "week" && session.status === "SCHEDULED" && session.date > today}
        dragging={draggedSession?.id === session.id}
        color={colorByClass.get(session.class.id)}
        onSelect={setSelected}
        onDragStart={startDragging}
        onDragEnd={stopDragging}
      />
    );
  }

  function pickDay(date: string) {
    setAnchor(date);
    setView("day");
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Consultá clases de cualquier fecha y abrí su registro de asistencia, alumnos y cobros."
        actionLabel="Nueva clase"
        onAction={() => setClassCreateOpen(true)}
      />

      <CalendarToolbar
        view={view}
        anchor={anchor}
        from={from}
        to={to}
        isCurrentWeek={isCurrentWeek}
        onViewChange={setView}
        onAnchorChange={setAnchor}
        onExtra={() => setExtraOpen(true)}
      />

      <CalendarFiltersBar filters={filters} options={options} onChange={setFilters} />

      {error ? (
        <ErrorBlock message={error} onRetry={() => void load()} />
      ) : loading && !data ? (
        <LoadingBlock label="Cargando calendario..." />
      ) : view === "month" ? (
        <MonthGrid dates={dates} byDate={byDate} anchor={anchor} today={today} renderCard={renderCard} onPickDay={pickDay} />
      ) : view === "week" ? (
        <WeekGrid
          dates={dates}
          byDate={byDate}
          today={today}
          dropDate={dropDate}
          renderCard={renderCard}
          onDropDateChange={setDropDate}
          onDropSession={prepareSessionMove}
        />
      ) : view === "day" ? (
        <DayBySpace sessions={byDate.get(anchor) ?? []} spaces={options.spaces} render={(session) => renderCard(session)} />
      ) : (
        <ListView dates={dates} byDate={byDate} empty={!visibleItems.length} renderCard={renderCard} />
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

      <ClassCreateModal
        open={classCreateOpen}
        options={options}
        onClose={() => setClassCreateOpen(false)}
        onCreated={async (danceClass) => {
          setOptions((current) => ({ ...current, classes: [...current.classes, danceClass] }));
          await load();
        }}
      />

      <ExtraSessionModal open={extraOpen} anchor={anchor} options={options} onClose={() => setExtraOpen(false)} onCreated={load} />
    </>
  );
}
