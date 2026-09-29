"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Plus,
  Power,
  Trash2,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type {
  Branch,
  CatalogItem,
  DanceClass,
  Paginated,
  Professor,
  Student
} from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./class-detail.module.css";

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

type Enrollment = {
  _id: string;
  studentId: Student;
  enrolledAt: string;
};

type EnrollmentResponse = {
  items: Enrollment[];
  capacity: number;
  occupied: number;
  available: number;
};

function refId(value: { _id: string } | string) {
  return typeof value === "string" ? value : value._id;
}

function refName(value: { name?: string; displayName?: string } | string) {
  return typeof value === "string" ? value : value.displayName ?? value.name ?? "Sin nombre";
}

export function ClassDetailLive({ id }: { id: string }) {
  const [danceClass, setDanceClass] = useState<DanceClass | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [editing, setEditing] = useState(false);
  const [editSchedules, setEditSchedules] = useState<ScheduleDraft[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [classData, enrollmentData, studentData, branchList, professorList, catalogList] = await Promise.all([
        apiFetch<DanceClass>(`/admin/classes/${id}`),
        apiFetch<EnrollmentResponse>(`/admin/enrollments?classId=${id}`),
        apiFetch<Paginated<Student>>("/admin/students?limit=100&isActive=true"),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<Professor[]>("/admin/professors?isActive=true"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);
      setDanceClass(classData);
      setEnrollments(enrollmentData);
      setStudents(studentData.items);
      setBranches(branchList.filter((item) => item.isActive));
      setProfessors(professorList.filter((item) => item.isActive));
      setCatalogs(catalogList.filter((item) => item.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const enrolledIds = useMemo(
    () => new Set(enrollments?.items.map((item) => item.studentId._id) ?? []),
    [enrollments]
  );

  const availableStudents = students.filter(
    (student) => !enrolledIds.has(student._id) && (!danceClass || student.branchId === danceClass.branchId)
  );

  const disciplines = catalogs.filter((item) => item.type === "DISCIPLINE");
  const segments = catalogs.filter((item) => item.type === "SEGMENT");
  const levels = catalogs.filter((item) => item.type === "LEVEL");

  function openEdit() {
    if (!danceClass) return;
    setEditSchedules(danceClass.schedules.map((schedule) => ({ ...schedule })));
    setEditing(true);
  }

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setEditSchedules((current) =>
      current.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? { ...schedule, ...patch } : schedule
      )
    );
  }

  async function enroll() {
    if (!studentId) return;
    setBusy(true);
    setError("");

    try {
      await apiFetch("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({ classId: id, studentId })
      });
      setStudentId("");
      setNotice("Alumno inscripto correctamente.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function remove(enrollmentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch<void>(`/admin/enrollments/${enrollmentId}`, { method: "DELETE" });
      setNotice("Inscripción dada de baja.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          name: form.get("name"),
          professorIds: form.getAll("professorIds"),
          disciplineIds: form.getAll("disciplineIds"),
          segmentIds: form.getAll("segmentIds"),
          levelIds: form.getAll("levelIds"),
          capacity: Number(form.get("capacity")),
          schedules: editSchedules
        })
      });
      setEditing(false);
      setNotice("Clase actualizada.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!danceClass) return;
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/classes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: danceClass.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
        })
      });
      setNotice(danceClass.status === "ACTIVE" ? "Clase inactivada." : "Clase reactivada.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!danceClass || !enrollments) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const selectedProfessorIds = danceClass.professorIds.map(refId);
  const selectedDisciplineIds = danceClass.disciplineIds.map(refId);
  const selectedSegmentIds = danceClass.segmentIds.map(refId);
  const selectedLevelIds = danceClass.levelIds.map(refId);

  return (
    <>
      <Link href="/admin/classes" className={styles.back}>
        <ArrowLeft size={15} /> Volver a clases
      </Link>

      <PageHeader
        eyebrow="GESTIÓN DE CLASE"
        title={danceClass.name}
        description="Horarios, profesores, categorías, cupo y alumnos inscriptos."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {notice && <div className={styles.notice}><Check size={16} /> {notice}</div>}

      <section className={styles.hero}>
        <div>
          <span className={danceClass.status === "ACTIVE" ? styles.active : styles.inactive}>
            {danceClass.status === "ACTIVE" ? "Clase activa" : "Clase inactiva"}
          </span>
          <h2>{danceClass.name}</h2>
          <p>{danceClass.professorIds.map(refName).join(", ")}</p>
        </div>
        <div className={styles.heroActions}>
          <button onClick={openEdit}>Editar clase</button>
          <button className={styles.dangerAction} disabled={busy} onClick={() => void toggleStatus()}>
            <Power size={15} /> {danceClass.status === "ACTIVE" ? "Inactivar" : "Reactivar"}
          </button>
        </div>
      </section>

      <div className={styles.stats}>
        <article><UsersRound size={17} /><span>Inscriptos</span><strong>{enrollments.occupied}</strong></article>
        <article><span className={styles.metricIcon}>C</span><span>Cupo total</span><strong>{enrollments.capacity}</strong></article>
        <article><Plus size={17} /><span>Disponibles</span><strong>{enrollments.available}</strong></article>
        <article><Clock3 size={17} /><span>Horarios</span><strong>{danceClass.schedules.length}</strong></article>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}><span>HORARIOS</span><h3>Agenda semanal</h3></div>
          <div className={styles.scheduleList}>
            {danceClass.schedules.map((schedule, index) => (
              <div key={index}>
                <CalendarDays size={16} />
                <strong>{dayLabels[schedule.day] ?? schedule.day}</strong>
                <span>{schedule.startTime}–{schedule.endTime}</span>
              </div>
            ))}
          </div>
          <div className={styles.tags}>
            {[...danceClass.disciplineIds, ...danceClass.segmentIds, ...danceClass.levelIds].map((item) => (
              <span key={refId(item)}>{refName(item)}</span>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}><span>INSCRIPCIÓN</span><h3>Agregar alumno</h3></div>
          <div className={styles.enrollBox}>
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Seleccionar alumno de la sede</option>
              {availableStudents.map((student) => (
                <option value={student._id} key={student._id}>
                  {student.firstName} {student.lastName}
                </option>
              ))}
            </select>
            <button disabled={!studentId || busy || enrollments.available <= 0 || danceClass.status !== "ACTIVE"} onClick={() => void enroll()}>
              <Plus size={15} /> Inscribir
            </button>
          </div>
          {enrollments.available <= 0 && <p className={styles.helper}>La clase alcanzó el cupo máximo.</p>}
        </section>

        <section className={styles.card + " " + styles.studentsCard}>
          <div className={styles.cardHeader}><span>ALUMNOS</span><h3>Inscriptos actuales</h3></div>
          <div className={styles.studentList}>
            {enrollments.items.length === 0 && <p className={styles.helper}>Todavía no hay alumnos inscriptos.</p>}
            {enrollments.items.map((enrollment) => (
              <div key={enrollment._id}>
                <Link href={`/admin/students/${enrollment.studentId._id}`} className={styles.studentIdentity}>
                  <span>{enrollment.studentId.firstName[0]}{enrollment.studentId.lastName[0]}</span>
                  <span>
                    <strong>{enrollment.studentId.firstName} {enrollment.studentId.lastName}</strong>
                    <small>{enrollment.studentId.phone || enrollment.studentId.email || "Sin contacto"}</small>
                  </span>
                </Link>
                <button title="Dar de baja" disabled={busy} onClick={() => void remove(enrollment._id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <LiveModal
        open={editing}
        title="Editar clase"
        description="Cambios de horario validan conflictos de los profesores asignados."
        submitting={busy}
        onClose={() => setEditing(false)}
        onSubmit={saveClass}
      >
        <Field label="Sede">
          <select name="branchId" defaultValue={danceClass.branchId} required>
            {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><input name="name" defaultValue={danceClass.name} required /></Field>
        <Field label="Cupo"><input name="capacity" type="number" min={1} defaultValue={danceClass.capacity} required /></Field>
        <Field label="Profesores" wide>
          <select name="professorIds" multiple defaultValue={selectedProfessorIds} size={Math.min(5, Math.max(3, professors.length))} required>
            {professors.map((professor) => <option key={professor._id} value={professor._id}>{professor.displayName}</option>)}
          </select>
        </Field>
        <Field label="Disciplinas">
          <select name="disciplineIds" multiple defaultValue={selectedDisciplineIds} size={4} required>
            {disciplines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Público">
          <select name="segmentIds" multiple defaultValue={selectedSegmentIds} size={3} required>
            {segments.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Niveles">
          <select name="levelIds" multiple defaultValue={selectedLevelIds} size={3} required>
            {levels.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </Field>

        <div className={styles.scheduleEditor}>
          <div className={styles.scheduleEditorHeader}>
            <strong>Horarios</strong>
            <button type="button" onClick={() => setEditSchedules((current) => [...current, { day: "MONDAY", startTime: "18:00", endTime: "19:00" }])}>
              <Plus size={14} /> Agregar
            </button>
          </div>
          {editSchedules.map((schedule, index) => (
            <div className={styles.scheduleEditorRow} key={index}>
              <select value={schedule.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>
                {Object.entries(dayLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="time" value={schedule.startTime} onChange={(event) => updateSchedule(index, { startTime: event.target.value })} />
              <input type="time" value={schedule.endTime} onChange={(event) => updateSchedule(index, { endTime: event.target.value })} />
              <button type="button" disabled={editSchedules.length === 1} onClick={() => setEditSchedules((current) => current.filter((_, i) => i !== index))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </LiveModal>
    </>
  );
}
