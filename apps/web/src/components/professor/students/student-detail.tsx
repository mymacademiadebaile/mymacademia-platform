"use client";

import { Mail, Phone } from "lucide-react";
import Link from "next/link";
import {
  BILLING_TYPE_LABEL,
  formatInstant,
  formatMoney,
  formatMonth,
  formatShortDate,
  fullName,
  groupLabel,
  referenceLabel
} from "../format";
import type { StudentDetailData } from "../professor-types";
import {
  AttendanceBadge,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  PageSkeleton,
  StudentPaymentBadge
} from "../professor-ui";
import { useProfessorData } from "../use-professor-data";
import styles from "./student-detail.module.css";

export function StudentDetail({ studentId }: { studentId: string }) {
  const { data, error, loading, reload } = useProfessorData<StudentDetailData>(`/students/${studentId}`);

  if (loading) return <PageSkeleton blocks={3} />;

  if (!data) {
    // The API answers 404 for unknown ids and for students outside the professor's classes.
    const notFound = /no encontrad|not found|404/i.test(error);
    return (
      <div>
        <Link href="/professor/students" className={styles.back}>
          ← Volver a mis alumnos
        </Link>
        {notFound ? (
          <EmptyState
            title="No encontramos a este alumno entre tus clases."
            action={
              <Link href="/professor/students" className={styles.linkButton}>
                Ver mis alumnos
              </Link>
            }
          />
        ) : (
          <ErrorState message={error} onRetry={() => void reload()} />
        )}
      </div>
    );
  }

  const { student, enrollments, payments, attendance } = data;
  const name = fullName(student);

  return (
    <div>
      <Link href="/professor/students" className={styles.back}>
        ← Volver a mis alumnos
      </Link>

      <header className={styles.header}>
        <Avatar name={name} size={72} />
        <div className={styles.headerText}>
          <h1>{name}</h1>
          <div className={styles.contact}>
            {student.email && (
              <a href={`mailto:${student.email}`}>
                <Mail size={16} aria-hidden /> {student.email}
              </a>
            )}
            {student.phone && (
              <a href={`tel:${student.phone.replace(/[^\d+]/g, "")}`}>
                <Phone size={16} aria-hidden /> {student.phone}
              </a>
            )}
          </div>
          <div className={styles.badges}>
            <span className={styles.active} data-active={student.isActive}>
              {student.isActive ? "Activo" : "Inactivo"}
            </span>
            <StudentPaymentBadge status={data.financialStatus} />
          </div>
        </div>
      </header>

      <div className={styles.sections}>
        <Card title="Clases conmigo">
          {enrollments.length === 0 ? (
            <p className={styles.muted}>No tiene inscripciones activas en tus clases.</p>
          ) : (
            <ul className={styles.enrollments}>
              {enrollments.map((enrollment) => {
                const group = groupLabel({
                  segments: enrollment.segments.map((value) => ({ name: value })),
                  levels: enrollment.levels.map((value) => ({ name: value }))
                });
                return (
                  <li key={enrollment.enrollmentId} className={styles.enrollment}>
                    <div>
                      <Link href={`/professor/classes/${enrollment.classId}`} className={styles.classLink}>
                        {enrollment.className}
                      </Link>
                      {group && <span className={styles.muted}>{group}</span>}
                    </div>
                    <dl className={styles.enrollmentFacts}>
                      <div>
                        <dt>Modalidad</dt>
                        <dd>{BILLING_TYPE_LABEL[enrollment.billingType]}</dd>
                      </div>
                      <div>
                        <dt>Estado actual</dt>
                        <dd>
                          <StudentPaymentBadge status={enrollment.paymentStatus} />
                          {enrollment.reference && (
                            <span className={styles.muted}>{referenceLabel(enrollment.reference)}</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Desde</dt>
                        <dd>{formatInstant(enrollment.enrolledAt)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Pagos">
          {payments.length === 0 ? (
            <p className={styles.muted}>Todavía no hay pagos registrados.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Clase</th>
                  <th scope="col">Concepto</th>
                  <th scope="col">Monto</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Fecha">
                      {payment.type === "MONTHLY" && payment.period
                        ? formatMonth(payment.period)
                        : formatShortDate(payment.date)}
                    </td>
                    <td data-label="Clase">{payment.className}</td>
                    <td data-label="Concepto">{payment.concept}</td>
                    <td data-label="Monto">{formatMoney(payment.amount)}</td>
                    <td data-label="Estado">
                      <StudentPaymentBadge status={payment.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Asistencia">
          <div className={styles.metrics}>
            <div>
              <strong>{attendance.totals.classes}</strong>
              <span>{attendance.totals.classes === 1 ? "clase" : "clases"}</span>
            </div>
            <div>
              <strong>{attendance.totals.present}</strong>
              <span>{attendance.totals.present === 1 ? "presente" : "presentes"}</span>
            </div>
            <div>
              <strong>{attendance.totals.absent}</strong>
              <span>{attendance.totals.absent === 1 ? "ausencia" : "ausencias"}</span>
            </div>
          </div>
          {attendance.recent.length === 0 ? (
            <p className={styles.muted}>Todavía no hay asistencias registradas.</p>
          ) : (
            <ul className={styles.recent}>
              {attendance.recent.map((item, index) => (
                <li key={`${item.date}-${item.className}-${index}`}>
                  <span className={styles.recentDate}>
                    {formatShortDate(item.date)} · {item.startTime}
                  </span>
                  <span className={styles.recentClass}>{item.className}</span>
                  <AttendanceBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
