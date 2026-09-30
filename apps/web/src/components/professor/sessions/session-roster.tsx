"use client";

import { Check, Users, X } from "lucide-react";
import Link from "next/link";
import { BILLING_TYPE_LABEL, formatMoney, fullName, referenceLabel } from "../format";
import type { AttendanceStatus, RosterItem } from "../professor-types";
import { AttendanceBadge, Avatar, Chip, EmptyState, StudentPaymentBadge } from "../professor-ui";
import styles from "./session-roster.module.css";

type Props = {
  roster: RosterItem[];
  /** Cancelled sessions cannot record attendance. */
  disabled?: boolean;
  onAttendance: (studentId: string, status: "PRESENT" | "ABSENT") => void;
};

function AttendanceButtons({
  item,
  disabled,
  onAttendance
}: {
  item: RosterItem;
  disabled?: boolean;
  onAttendance: Props["onAttendance"];
}) {
  const name = fullName(item.student);
  const current: AttendanceStatus = item.attendanceStatus;
  return (
    <div className={styles.toggle} role="group" aria-label={`Asistencia de ${name}`}>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={current === "PRESENT"}
        data-active={current === "PRESENT"}
        data-kind="present"
        onClick={() => current !== "PRESENT" && onAttendance(item.studentId, "PRESENT")}
      >
        <Check size={15} aria-hidden />
        Presente
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={current === "ABSENT"}
        data-active={current === "ABSENT"}
        data-kind="absent"
        onClick={() => current !== "ABSENT" && onAttendance(item.studentId, "ABSENT")}
      >
        <X size={15} aria-hidden />
        Ausente
      </button>
    </div>
  );
}

function Amount({ item }: { item: RosterItem }) {
  return <>{item.billingType === "FREE" || item.payment.status === "FREE" ? "—" : formatMoney(item.payment.amount)}</>;
}

export function SessionRoster({ roster, disabled, onAttendance }: Props) {
  if (!roster.length) {
    return (
      <EmptyState
        icon={<Users size={24} />}
        title="Todavía no hay alumnos en esta clase"
        description="Cuando se inscriban alumnos o se agenden clases de prueba, los vas a ver acá para tomar asistencia."
      />
    );
  }

  return (
    <div>
      {disabled && (
        <p className={styles.notice} role="note">
          Esta clase está cancelada, por eso no se puede registrar asistencia.
        </p>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Alumno</th>
            <th scope="col">Modalidad</th>
            <th scope="col">Estado de pago</th>
            <th scope="col">Monto</th>
            <th scope="col">Asistencia</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((item) => {
            const name = fullName(item.student);
            return (
              <tr key={item.studentId}>
                <td>
                  <div className={styles.person}>
                    <Avatar name={name} size={36} />
                    <div>
                      <strong>{name}</strong>
                      {item.participantType === "TRIAL" && <Chip>Clase de prueba</Chip>}
                    </div>
                  </div>
                </td>
                <td>{BILLING_TYPE_LABEL[item.billingType]}</td>
                <td>
                  <div className={styles.stack}>
                    <StudentPaymentBadge status={item.payment.status} />
                    {item.payment.reference && <small>{referenceLabel(item.payment.reference)}</small>}
                  </div>
                </td>
                <td>
                  <Amount item={item} />
                </td>
                <td>
                  <AttendanceBadge status={item.attendanceStatus} />
                </td>
                <td>
                  <div className={styles.actions}>
                    <AttendanceButtons item={item} disabled={disabled} onAttendance={onAttendance} />
                    <Link
                      href={`/professor/students/${item.studentId}`}
                      className={styles.viewLink}
                      aria-label={`Ver alumno ${name}`}
                    >
                      Ver alumno
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul className={styles.cards}>
        {roster.map((item) => {
          const name = fullName(item.student);
          return (
            <li key={item.studentId} className={styles.rowCard}>
              <div className={styles.cardTop}>
                <div className={styles.person}>
                  <Avatar name={name} size={40} />
                  <div>
                    <strong>{name}</strong>
                    {item.participantType === "TRIAL" && <Chip>Clase de prueba</Chip>}
                  </div>
                </div>
                <AttendanceBadge status={item.attendanceStatus} />
              </div>
              <dl className={styles.cardFacts}>
                <div>
                  <dt>Modalidad</dt>
                  <dd>{BILLING_TYPE_LABEL[item.billingType]}</dd>
                </div>
                <div>
                  <dt>Monto</dt>
                  <dd>
                    <Amount item={item} />
                  </dd>
                </div>
                <div>
                  <dt>Pago</dt>
                  <dd className={styles.stack}>
                    <StudentPaymentBadge status={item.payment.status} />
                    {item.payment.reference && <small>{referenceLabel(item.payment.reference)}</small>}
                  </dd>
                </div>
              </dl>
              <AttendanceButtons item={item} disabled={disabled} onAttendance={onAttendance} />
              <Link href={`/professor/students/${item.studentId}`} className={styles.viewLink}>
                Ver alumno
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
