"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, UsersRound } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { DanceClass, Paginated, Student } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

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

export function ClassDetailLive({ id }: { id: string }) {
  const [danceClass, setDanceClass] = useState<DanceClass | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [classData, enrollmentData, studentData] = await Promise.all([
        apiFetch<DanceClass>(`/admin/classes/${id}`),
        apiFetch<EnrollmentResponse>(`/admin/enrollments?classId=${id}`),
        apiFetch<Paginated<Student>>("/admin/students?limit=100")
      ]);
      setDanceClass(classData);
      setEnrollments(enrollmentData);
      setStudents(studentData.items.filter((item) => item.isActive));
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

  return (
    <>
      <Link href="/admin/classes" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginBottom: 14, color: "#5b21b6", fontSize: 10, fontWeight: 800 }}>
        <ArrowLeft size={15} /> Volver a clases
      </Link>

      <PageHeader
        eyebrow="GESTIÓN DE CLASE"
        title={danceClass.name}
        description="Administrá el cupo y los alumnos inscriptos."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <div className={styles.liveGrid3}>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Cupo total</span>
          <strong className={styles.cardValue}>{enrollments.capacity}</strong>
        </article>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Inscriptos</span>
          <strong className={styles.cardValue}>{enrollments.occupied}</strong>
        </article>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Disponibles</span>
          <strong className={styles.cardValue}>{enrollments.available}</strong>
        </article>
      </div>

      <section className={styles.card} style={{ marginBottom: 14 }}>
        <strong style={{ display: "block", marginBottom: 10, fontSize: 12 }}>Agregar alumno</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            style={{ flex: 1, minHeight: 42, border: "1px solid #e5deea", borderRadius: 11, padding: "0 10px" }}
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">Seleccionar alumno de la sede</option>
            {availableStudents.map((student) => (
              <option value={student._id} key={student._id}>
                {student.firstName} {student.lastName}
              </option>
            ))}
          </select>
          <button className={styles.primary} disabled={!studentId || busy || enrollments.available <= 0} onClick={() => void enroll()}>
            <Plus size={16} /> Inscribir
          </button>
        </div>
      </section>

      <div className={styles.listCard}>
        {enrollments.items.length === 0 && (
          <div className={styles.stateBlock}>
            <UsersRound size={24} />
            <span>Todavía no hay alumnos inscriptos.</span>
          </div>
        )}
        {enrollments.items.map((enrollment) => (
          <div className={styles.listRow} key={enrollment._id}>
            <span className={styles.avatar}>
              {enrollment.studentId.firstName[0]}{enrollment.studentId.lastName[0]}
            </span>
            <span className={styles.rowBody}>
              <strong>{enrollment.studentId.firstName} {enrollment.studentId.lastName}</strong>
              <small>{enrollment.studentId.phone || enrollment.studentId.email || "Sin contacto"}</small>
            </span>
            <button className={styles.inlineAction} disabled={busy} onClick={() => void remove(enrollment._id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
