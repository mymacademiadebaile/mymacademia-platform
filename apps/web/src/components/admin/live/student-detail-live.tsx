"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDollarSign,
  Mail,
  MessageCircle,
  Plus,
  Power,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Branch, DanceClass, Payment, Student } from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./student-detail.module.css";

type Enrollment = {
  _id: string;
  status: "ACTIVE" | "INACTIVE";
  enrolledAt: string;
  endedAt?: string;
  classId: DanceClass;
};

type StudentDetail = {
  student: Student;
  enrollments: Enrollment[];
  payments: Payment[];
  financial: {
    paidAmount: number;
    paidCount: number;
    pendingAmount: number;
    pendingCount: number;
    overdueAmount: number;
    overdueCount: number;
  };
};

function paymentStatus(payment: Payment) {
  if (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
}

function whatsappHref(phone?: string, name?: string) {
  if (!phone) return "";
  const normalized = phone.replace(/\D/g, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(`Hola ${name ?? ""}, te escribimos desde M&M Academia de Baile.`)}`;
}

export function StudentDetailLive({ id }: { id: string }) {
  const [data, setData] = useState<StudentDetail | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [editing, setEditing] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [detail, branchList, classList] = await Promise.all([
        apiFetch<StudentDetail>(`/admin/students/${id}`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<DanceClass[]>("/admin/classes")
      ]);
      setData(detail);
      setBranches(branchList);
      setClasses(classList);
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeEnrollments = useMemo(
    () => data?.enrollments.filter((enrollment) => enrollment.status === "ACTIVE") ?? [],
    [data]
  );

  const availableClasses = useMemo(() => {
    if (!data) return [];
    const activeClassIds = new Set(activeEnrollments.map((enrollment) => enrollment.classId._id));

    return classes.filter(
      (danceClass) =>
        danceClass.status === "ACTIVE" &&
        danceClass.branchId === data.student.branchId &&
        !activeClassIds.has(danceClass._id)
    );
  }, [classes, data, activeEnrollments]);

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await apiFetch<Student>(`/admin/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          birthDate: form.get("birthDate") || undefined,
          guardianName: form.get("guardianName"),
          guardianPhone: form.get("guardianPhone"),
          notes: form.get("notes")
        })
      });
      setEditing(false);
      setNotice("Datos del alumno actualizados.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!data) return;
    setBusy(true);
    setError("");

    try {
      await apiFetch<Student>(`/admin/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !data.student.isActive })
      });
      setNotice(data.student.isActive ? "Alumno inactivado." : "Alumno reactivado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClassId) return;

    setBusy(true);
    setError("");

    try {
      await apiFetch("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({ classId: selectedClassId, studentId: id })
      });
      setSelectedClassId("");
      setEnrollModal(false);
      setNotice("Alumno inscripto correctamente.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function removeEnrollment(enrollmentId: string) {
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

  async function markPaid(paymentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/mark-paid`, { method: "POST" });
      setNotice("Pago registrado.");
      await load();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function remind(paymentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/remind`, { method: "POST" });
      setNotice("Recordatorio enviado por email.");
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const { student, financial } = data;
  const fullName = `${student.firstName} ${student.lastName}`;

  return (
    <>
      <Link href="/admin/students" className={styles.back}>
        <ArrowLeft size={15} /> Volver a alumnos
      </Link>

      <PageHeader
        eyebrow="FICHA DE ALUMNO"
        title={fullName}
        description="Datos personales, clases, contacto y estado de cuenta."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {notice && <div className={styles.notice}><Check size={16} /> {notice}</div>}

      <section className={styles.hero}>
        <span className={styles.avatar}>{student.firstName[0]}{student.lastName[0]}</span>
        <div className={styles.heroText}>
          <span className={student.isActive ? styles.active : styles.inactive}>
            {student.isActive ? "Alumno activo" : "Alumno inactivo"}
          </span>
          <h2>{fullName}</h2>
          <p>{student.phone || student.email || "Sin contacto cargado"}</p>
        </div>
        <div className={styles.heroActions}>
          {student.email && (
            <a href={`mailto:${student.email}`}><Mail size={16} /> Email</a>
          )}
          {student.phone && (
            <a href={whatsappHref(student.phone, student.firstName)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          <button onClick={() => setEditing(true)}>Editar</button>
          <button className={styles.dangerAction} disabled={busy} onClick={() => void toggleActive()}>
            <Power size={16} /> {student.isActive ? "Inactivar" : "Reactivar"}
          </button>
        </div>
      </section>

      <div className={styles.financialGrid}>
        <article><span>Cobrado</span><strong>$ {financial.paidAmount.toLocaleString("es-AR")}</strong><small>{financial.paidCount} pagos</small></article>
        <article><span>Pendiente</span><strong>$ {financial.pendingAmount.toLocaleString("es-AR")}</strong><small>{financial.pendingCount} cuotas</small></article>
        <article data-tone="danger"><span>Vencido</span><strong>$ {financial.overdueAmount.toLocaleString("es-AR")}</strong><small>{financial.overdueCount} cuotas</small></article>
        <article><span>Clases activas</span><strong>{activeEnrollments.length}</strong><small>inscripciones actuales</small></article>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span>DATOS</span><h3>Información personal</h3></div>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Sede</dt><dd>{branches.find((branch) => branch._id === student.branchId)?.name ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{student.email || "—"}</dd></div>
            <div><dt>Teléfono</dt><dd>{student.phone || "—"}</dd></div>
            <div><dt>Nacimiento</dt><dd>{student.birthDate ? new Date(student.birthDate).toLocaleDateString("es-AR") : "—"}</dd></div>
            <div><dt>Responsable</dt><dd>{student.guardianName || "—"}</dd></div>
            <div><dt>Tel. responsable</dt><dd>{student.guardianPhone || "—"}</dd></div>
            <div className={styles.notes}><dt>Notas</dt><dd>{student.notes || "Sin notas"}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span>CLASES</span><h3>Inscripciones</h3></div>
            <button onClick={() => setEnrollModal(true)}><Plus size={15} /> Inscribir</button>
          </div>

          <div className={styles.itemList}>
            {activeEnrollments.length === 0 && <p className={styles.empty}>No tiene clases activas.</p>}
            {activeEnrollments.map((enrollment) => (
              <div key={enrollment._id}>
                <span className={styles.itemIcon}><CalendarDays size={17} /></span>
                <span>
                  <strong>{enrollment.classId.name}</strong>
                  <small>
                    {enrollment.classId.schedules?.[0]
                      ? `${enrollment.classId.schedules[0].day} · ${enrollment.classId.schedules[0].startTime}`
                      : "Sin horario"}
                  </small>
                </span>
                <button
                  title="Dar de baja"
                  disabled={busy}
                  onClick={() => void removeEnrollment(enrollment._id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card + " " + styles.paymentsCard}>
          <div className={styles.cardHeader}>
            <div><span>CUENTA</span><h3>Pagos y cuotas</h3></div>
            <Link href="/admin/payments"><CircleDollarSign size={15} /> Ver módulo pagos</Link>
          </div>

          <div className={styles.paymentTable}>
            <div className={styles.paymentHead}>
              <span>Concepto</span><span>Período</span><span>Vencimiento</span><span>Importe</span><span>Estado</span><span />
            </div>
            {data.payments.length === 0 && <p className={styles.empty}>Todavía no tiene cuotas registradas.</p>}
            {data.payments.map((payment) => {
              const status = paymentStatus(payment);
              return (
                <div className={styles.paymentRow} key={payment._id}>
                  <span><strong>{payment.concept}</strong></span>
                  <span>{payment.period}</span>
                  <span>{new Date(payment.dueDate).toLocaleDateString("es-AR")}</span>
                  <span>$ {payment.amount.toLocaleString("es-AR")}</span>
                  <span className={status === "PAID" ? styles.statusPaid : status === "OVERDUE" ? styles.statusOverdue : styles.statusPending}>
                    {status === "PAID" ? "Pagado" : status === "OVERDUE" ? "Vencido" : "Pendiente"}
                  </span>
                  <span className={styles.rowActions}>
                    {status !== "PAID" && <button disabled={busy} onClick={() => void markPaid(payment._id)}>Pagar</button>}
                    {status !== "PAID" && student.email && <button disabled={busy} onClick={() => void remind(payment._id)}>Recordar</button>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <LiveModal
        open={editing}
        title="Editar alumno"
        description="Actualizá los datos de la ficha."
        submitting={busy}
        onClose={() => setEditing(false)}
        onSubmit={saveStudent}
      >
        <Field label="Sede">
          <select name="branchId" required defaultValue={student.branchId}>
            {branches.filter((branch) => branch.isActive).map((branch) => (
              <option value={branch._id} key={branch._id}>{branch.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre"><input name="firstName" defaultValue={student.firstName} required /></Field>
        <Field label="Apellido"><input name="lastName" defaultValue={student.lastName} required /></Field>
        <Field label="Teléfono"><input name="phone" defaultValue={student.phone ?? ""} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={student.email ?? ""} /></Field>
        <Field label="Fecha de nacimiento">
          <input name="birthDate" type="date" defaultValue={student.birthDate ? student.birthDate.slice(0, 10) : ""} />
        </Field>
        <Field label="Responsable"><input name="guardianName" defaultValue={student.guardianName ?? ""} /></Field>
        <Field label="Teléfono responsable"><input name="guardianPhone" defaultValue={student.guardianPhone ?? ""} /></Field>
        <Field label="Notas" wide><textarea name="notes" rows={4} defaultValue={student.notes ?? ""} /></Field>
      </LiveModal>

      <LiveModal
        open={enrollModal}
        title="Inscribir en una clase"
        description="Sólo se muestran clases activas de la misma sede donde todavía no está inscripto."
        submitting={busy}
        onClose={() => setEnrollModal(false)}
        onSubmit={enroll}
      >
        <Field label="Clase" wide>
          <select
            required
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
          >
            <option value="" disabled>Seleccionar clase</option>
            {availableClasses.map((danceClass) => (
              <option key={danceClass._id} value={danceClass._id}>{danceClass.name}</option>
            ))}
          </select>
        </Field>
      </LiveModal>
    </>
  );
}
