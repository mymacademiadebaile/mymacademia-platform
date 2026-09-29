"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, UsersRound } from "lucide-react";
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

function refName<T extends { name?: string; displayName?: string }>(value: T | string): string {
  return typeof value === "string" ? value : value.displayName ?? value.name ?? "Sin nombre";
}

export function ClassesLive() {
  const [items, setItems] = useState<DanceClass[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [classList, branchList, professorList, catalogList] = await Promise.all([
        apiFetch<DanceClass[]>("/admin/classes"),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<Professor[]>("/admin/professors"),
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const disciplines = useMemo(() => catalogs.filter((item) => item.type === "DISCIPLINE"), [catalogs]);
  const segments = useMemo(() => catalogs.filter((item) => item.type === "SEGMENT"), [catalogs]);
  const levels = useMemo(() => catalogs.filter((item) => item.type === "LEVEL"), [catalogs]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");

    try {
      await apiFetch<DanceClass>("/admin/classes", {
        method: "POST",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          name: form.get("name"),
          professorIds: [form.get("professorId")],
          disciplineIds: [form.get("disciplineId")],
          segmentIds: [form.get("segmentId")],
          levelIds: [form.get("levelId")],
          capacity: Number(form.get("capacity")),
          schedules: [{
            day: form.get("day"),
            startTime: form.get("startTime"),
            endTime: form.get("endTime")
          }]
        })
      });
      setModal(false);
      await load();
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
        description="Clases reales vinculadas con profesores y catálogos maestros."
        actionLabel="Nueva clase"
        onAction={() => setModal(true)}
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock />}

      {!loading && (
        <div className={styles.liveGrid3}>
          {items.map((danceClass) => {
            const schedule = danceClass.schedules[0];
            return (
              <article className={styles.card} key={danceClass._id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span className={danceClass.status === "ACTIVE" ? styles.pill : styles.pillOff}>
                    {danceClass.status === "ACTIVE" ? "Activa" : "Inactiva"}
                  </span>
                  <span className={styles.cardDetail}>Cupo {danceClass.capacity}</span>
                </div>
                <strong style={{ display: "block", marginTop: 14, fontSize: 15 }}>
                  {danceClass.name}
                </strong>
                <span style={{ display: "block", marginTop: 5, color: "#7c7283", fontSize: 9 }}>
                  {danceClass.professorIds.map((item) => refName(item)).join(", ")}
                </span>
                {schedule && (
                  <div style={{ marginTop: 14, display: "flex", gap: 7, alignItems: "center", fontSize: 10, color: "#5b21b6" }}>
                    <Clock3 size={15} />
                    {dayLabels[schedule.day] ?? schedule.day} · {schedule.startTime}–{schedule.endTime}
                  </div>
                )}
                <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {danceClass.disciplineIds.map((item) => (
                    <span className={styles.pillOff} key={typeof item === "string" ? item : item._id}>
                      {refName(item)}
                    </span>
                  ))}
                  {danceClass.segmentIds.map((item) => (
                    <span className={styles.pillOff} key={typeof item === "string" ? item : item._id}>
                      {refName(item)}
                    </span>
                  ))}
                  {danceClass.levelIds.map((item) => (
                    <span className={styles.pillOff} key={typeof item === "string" ? item : item._id}>
                      {refName(item)}
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 15, paddingTop: 12, borderTop: "1px solid #eee8f2", display: "flex", alignItems: "center", gap: 6, color: "#776d7e", fontSize: 9 }}>
                  <UsersRound size={15} />
                  Las inscripciones se reflejarán en el cupo disponible.
                </div>
              </article>
            );
          })}
        </div>
      )}

      <LiveModal
        open={modal}
        title="Crear clase"
        description="Las categorías se seleccionan de los catálogos administrados."
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
        <Field label="Profesor">
          <select name="professorId" required defaultValue="">
            <option value="" disabled>Seleccionar profesor</option>
            {professors.map((item) => <option value={item._id} key={item._id}>{item.displayName}</option>)}
          </select>
        </Field>
        <Field label="Disciplina">
          <select name="disciplineId" required defaultValue="">
            <option value="" disabled>Seleccionar</option>
            {disciplines.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Público">
          <select name="segmentId" required defaultValue="">
            <option value="" disabled>Seleccionar</option>
            {segments.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Nivel">
          <select name="levelId" required defaultValue="">
            <option value="" disabled>Seleccionar</option>
            {levels.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Cupo"><input name="capacity" type="number" min={1} defaultValue={20} required /></Field>
        <Field label="Día">
          <select name="day" required defaultValue="MONDAY">
            {Object.entries(dayLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Desde"><input name="startTime" type="time" required /></Field>
        <Field label="Hasta"><input name="endTime" type="time" required /></Field>
      </LiveModal>
    </>
  );
}
