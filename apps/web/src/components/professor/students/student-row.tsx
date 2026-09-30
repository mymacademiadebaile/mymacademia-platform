"use client";

import Link from "next/link";
import { BILLING_TYPE_LABEL, formatShortDate, fullName, referenceLabel, groupLabel } from "../format";
import type { StudentOverview } from "../professor-types";
import { AttendanceBadge, Avatar, StudentPaymentBadge } from "../professor-ui";
import styles from "./student-row.module.css";

/** One table row (cards on mobile). `student.enrollments` is already filtered by the parent. */
export function StudentRow({ student }: { student: StudentOverview }) {
  const name = fullName(student);
  const last = student.lastAttendance;

  return (
    <tr className={styles.row}>
      <td data-label="Alumno" className={styles.nameCell}>
        <Link href={`/professor/students/${student.id}`} className={styles.person}>
          <Avatar name={name} size={40} />
          <strong>{name}</strong>
        </Link>
      </td>
      <td data-label="Contacto">
        <div className={styles.stack}>
          {student.email && <span className={styles.wrap}>{student.email}</span>}
          {student.phone && <span>{student.phone}</span>}
          {!student.email && !student.phone && <span className={styles.muted}>—</span>}
        </div>
      </td>
      <td data-label="Clases">
        <div className={styles.stack}>
          {student.enrollments.map((enrollment) => (
            <span key={enrollment.enrollmentId} className={styles.line}>
              {enrollment.className}
              {(enrollment.segments.length > 0 || enrollment.levels.length > 0) && (
                <small className={styles.muted}>
                  {groupLabel({
                    segments: enrollment.segments.map((value) => ({ name: value })),
                    levels: enrollment.levels.map((value) => ({ name: value }))
                  })}
                </small>
              )}
            </span>
          ))}
        </div>
      </td>
      <td data-label="Modalidad">
        <div className={styles.stack}>
          {student.enrollments.map((enrollment) => (
            <span key={enrollment.enrollmentId} className={styles.line}>
              {BILLING_TYPE_LABEL[enrollment.billingType]}
            </span>
          ))}
        </div>
      </td>
      <td data-label="Estado financiero">
        <div className={styles.stack}>
          {student.enrollments.map((enrollment) => (
            <span key={enrollment.enrollmentId} className={styles.line}>
              <StudentPaymentBadge status={enrollment.paymentStatus} />
              {enrollment.reference && (
                <small className={styles.muted}>{referenceLabel(enrollment.reference)}</small>
              )}
            </span>
          ))}
        </div>
      </td>
      <td data-label="Última asistencia">
        {last ? (
          <div className={styles.stack}>
            <span className={styles.line}>
              <AttendanceBadge status={last.status} />
              <small className={styles.muted}>{formatShortDate(last.date)}</small>
            </span>
            <small className={styles.muted}>{last.className}</small>
          </div>
        ) : (
          <span className={styles.muted}>Sin registros</span>
        )}
      </td>
      <td className={styles.actionCell}>
        <Link
          href={`/professor/students/${student.id}`}
          className={styles.action}
          aria-label={`Ver ficha de ${name}`}
        >
          Ver ficha
        </Link>
      </td>
    </tr>
  );
}
