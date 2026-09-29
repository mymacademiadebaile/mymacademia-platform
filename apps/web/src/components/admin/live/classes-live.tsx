"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Plus, Search, Trash2, UsersRound } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, CatalogItem, DanceClass, Professor } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
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

function refName<T extends { name?: string; displayName?: string }>(value: T | string): string {
  return typeof value === "string" ? value : value.displayName ?? value.name ?? "Sin nombre";
}

export function ClassesLive() {
  const [items, setItems] = useState<DanceClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [professorId, setProfessorId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [modal, setModal] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>([
    { day: "MONDAY", startTime: "18:00", endTime: "19:00" }
  ]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
        apiFetch<DanceClass[]>(`/admin/classes?${params.toString()}`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<Professor[]>("/admin/professors?isActive=true"),
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
      { day: "MONDAY", startTime: "18:00", endTime: "19:00" }
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
          schedules
        })
      });

      setModal(false);
      setSchedules([{ day: "MONDAY", startTime: "18:00", endTime: "19:00" }]);
      window.location.assign(`/admin/classes/${danceClass._id}`);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="PLANIFICACIÓN"
        title="Clases y horarios"
        description="Profesores, categorías, agenda y ocupación real de cada clase."
        actionLabel="Nueva clase"
        onAction={() => setModal(true)}
      />

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
          <option value="INACTIVE">Inactivas</option>
          <option value="ALL">Todas</option>
        </select>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.liveGrid3}>
          {items.length === 0 && <div className={styles.stateBlock}>No hay clases para estos filtros.</div>}
          {items.map((danceClass) => {
            const occupied = danceClass.activeEnrollmentCount ?? 0;
            const occupancy = Math.min(100, Math.round((occupied / danceClass.capacity) * 100));

            return (
              <Link className={styles.cardLink} href={`/admin/classes/${danceClass._id}`} key={danceClass._id}>
                <div className={styles.cardTopLine}>
                  <span className={danceClass.status === "ACTIVE" ? styles.pill : styles.pillOff}>
                    {danceClass.status === "ACTIVE" ? "Activa" : "Inactiva"}
                  </span>
                  <span className={styles.cardDetail}>{occupied}/{danceClass.capacity} alumnos</span>
                </div>

                <strong className={styles.cardTitle}>{danceClass.name}</strong>
                <span className={styles.cardDetail}>
                  {danceClass.professorIds.map((item) => refName(item)).join(", ")}
                </span>

                <div className={styles.scheduleSummary}>
                  <Clock3 size={15} />
                  <span>
                    {danceClass.schedules.map((schedule) =>
                      `${dayLabels[schedule.day] ?? schedule.day} ${schedule.startTime}–${schedule.endTime}`
                    ).join(" · ")}
                  </span>
                </div>

                <div className={styles.tagRow}>
                  {[...danceClass.disciplineIds, ...danceClass.segmentIds, ...danceClass.levelIds].map((item) => (
                    <span key={typeof item === "string" ? item : item._id}>{refName(item)}</span>
                  ))}
                </div>

                <div className={styles.occupancyBar}>
                  <span style={{ width: `${occupancy}%` }} />
                </div>

                <div className={styles.cardFooterLink}>
                  <UsersRound size={15} /> Gestionar clase
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Crear clase"
        description="Podés asignar varios profesores, categorías y horarios."
        submitting={submitting}
        onClose={() => setModal(false)}
        onSubmit={create}
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
