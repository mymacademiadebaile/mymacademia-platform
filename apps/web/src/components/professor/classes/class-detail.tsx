"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KeyboardEvent, useRef, useState } from "react";
import {
  BILLING_MODE_LABEL,
  BILLING_TYPE_LABEL,
  formatFullDate,
  formatLongDate,
  formatMoney,
  fullName,
  groupLabel,
  priceLabel,
  referenceLabel,
  scheduleDays
} from "../format";
import type { ClassDetailData } from "../professor-types";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  PageSkeleton,
  SessionPhaseBadge,
  StudentPaymentBadge
} from "../professor-ui";
import { useProfessorData } from "../use-professor-data";
import styles from "./class-detail.module.css";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "calendario", label: "Calendario" },
  { id: "alumnos", label: "Alumnos" },
  { id: "historial", label: "Historial" }
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTab(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

export function ClassDetail({ classId }: { classId: string }) {
  const { data, error, loading, refreshing, reload } = useProfessorData<ClassDetailData>(`/classes/${classId}`);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(isTab(initial) ? initial : "resumen");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectTab(next: TabId) {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((item) => item.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  if (loading) return <PageSkeleton blocks={3} />;

  if (!data) {
    const notFound = /no encontrad/i.test(error);
    return (
      <div>
        <Link href="/professor/classes" className={styles.back}>
          ← Volver a mis clases
        </Link>
        {notFound ? (
          <EmptyState
            title="No encontramos esta clase entre tus clases."
            action={
              <Link href="/professor/classes" className={styles.linkButton}>
                Ver mis clases
              </Link>
            }
          />
        ) : (
          <ErrorState message={error} onRetry={() => void reload()} />
        )}
      </div>
    );
  }

  const item = data.class;
  const group = groupLabel(item);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Link href="/professor/classes" className={styles.heroBack}>
          ← Volver a mis clases
        </Link>
        <div className={styles.heroRow}>
          <h1>{item.name}</h1>
          <span className={styles.status} data-active={item.status === "ACTIVE"}>
            {item.status === "ACTIVE" ? "Activa" : "Inactiva"}
          </span>
        </div>
        <div className={styles.heroChips}>
          {group && <span className={styles.heroChip}>{group}</span>}
          {item.disciplines.map((discipline) => (
            <span key={discipline.id} className={styles.heroChip}>
              {discipline.name}
            </span>
          ))}
          <span className={styles.heroChip}>{item.branch.name}</span>
          {refreshing && <span className={styles.heroChip}>Actualizando…</span>}
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Secciones de la clase" onKeyDown={onKeyDown}>
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={styles.panel}>
        {tab === "resumen" && (
          <Card>
            <dl className={styles.facts}>
              <Fact label="Clase" value={item.name} />
              <Fact
                label="Disciplina"
                value={item.disciplines.map((value) => value.name).join(", ") || "—"}
              />
              <Fact label="Nivel" value={item.levels.map((value) => value.name).join(", ") || "—"} />
              <Fact label="Público" value={item.segments.map((value) => value.name).join(", ") || "—"} />
              <Fact label="Sede" value={item.branch.name} />
              <Fact
                label="Horarios"
                value={
                  <>
                    {scheduleDays(item.schedules)}
                    <ul className={styles.slotList}>
                      {item.schedules.map((slot, index) => (
                        <li key={`${slot.day}-${index}`}>
                          {slot.startTime} – {slot.endTime}
                        </li>
                      ))}
                    </ul>
                  </>
                }
              />
              <Fact label="Cupo" value={`${item.enrolledCount} / ${item.capacity} alumnos`} />
              <Fact label="Modalidad de cobro" value={BILLING_MODE_LABEL[item.billingMode]} />
              <Fact
                label="Precios"
                value={
                  item.billingMode === "FREE" ? (
                    "Gratis"
                  ) : (
                    <>
                      <span className={styles.block}>Por clase: {formatMoney(item.pricePerClass)}</span>
                      <span className={styles.block}>Mensual: {formatMoney(item.monthlyPrice)}</span>
                      <span className={styles.hint}>{priceLabel(item)}</span>
                    </>
                  )
                }
              />
              <Fact label="Prueba gratis" value={item.freeTrialEnabled ? "Habilitada" : "No"} />
              <Fact label="Estado" value={item.status === "ACTIVE" ? "Activa" : "Inactiva"} />
            </dl>
          </Card>
        )}

        {tab === "calendario" &&
          (data.upcoming.length === 0 ? (
            <EmptyState
              title="No hay clases programadas próximamente."
              description="Cuando se generen nuevas fechas de esta clase, aparecen acá."
            />
          ) : (
            <ul className={styles.list}>
              {data.upcoming.map((session) => (
                <li key={session.id}>
                  <Link href={`/professor/sessions/${session.id}`} className={styles.sessionRow}>
                    <div>
                      <strong>{formatLongDate(session.date)}</strong>
                      <span className={styles.sub}>
                        {session.startTime} – {session.endTime}
                      </span>
                    </div>
                    <SessionPhaseBadge phase={session.phase} />
                    <span className={styles.sub}>{session.enrolledCount} alumnos</span>
                    <span className={styles.rowLink}>Ver clase</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {tab === "alumnos" &&
          (data.students.length === 0 ? (
            <EmptyState
              title="Todavía no hay alumnos inscriptos en esta clase."
              description="Los alumnos con inscripción activa aparecen acá."
            />
          ) : (
            <Card className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Alumno</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Modalidad</th>
                    <th scope="col">Pago</th>
                    <th scope="col">Última asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((student) => {
                    const name = fullName(student);
                    return (
                      <tr key={`${student.id}-${student.enrollment.enrollmentId}`}>
                        <td data-label="Alumno">
                          <Link href={`/professor/students/${student.id}`} className={styles.person}>
                            <Avatar name={name} size={36} />
                            <strong>{name}</strong>
                          </Link>
                        </td>
                        <td data-label="Contacto">
                          <div>
                            {student.email && <span className={styles.block}>{student.email}</span>}
                            {student.phone && <span className={styles.block}>{student.phone}</span>}
                            {!student.email && !student.phone && "—"}
                          </div>
                        </td>
                        <td data-label="Modalidad">{BILLING_TYPE_LABEL[student.enrollment.billingType]}</td>
                        <td data-label="Pago">
                          <div>
                            <StudentPaymentBadge status={student.enrollment.paymentStatus} />
                            {student.enrollment.reference && (
                              <span className={`${styles.block} ${styles.sub}`}>
                                {referenceLabel(student.enrollment.reference)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-label="Última asistencia">
                          {student.lastAttendance ? (
                            <span>
                              {student.lastAttendance.status === "PRESENT" ? "Presente" : "Ausente"} ·{" "}
                              {formatFullDate(student.lastAttendance.date)}
                            </span>
                          ) : (
                            "Sin registros"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}

        {tab === "historial" &&
          (data.history.length === 0 ? (
            <EmptyState
              title="Todavía no hay clases pasadas."
              description="El historial se arma a medida que se dictan las clases."
            />
          ) : (
            <Card className={styles.tableCard}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Presentes</th>
                    <th scope="col">Ausentes</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Pagos</th>
                    <th scope="col">
                      <span className={styles.srOnly}>Acción</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((session) => (
                    <tr key={session.id}>
                      <td data-label="Fecha">
                        <Link href={`/professor/sessions/${session.id}`} className={styles.dateLink}>
                          {formatLongDate(session.date)}
                        </Link>
                        <span className={`${styles.block} ${styles.sub}`}>
                          {session.startTime} – {session.endTime}
                        </span>
                      </td>
                      <td data-label="Presentes">{session.summary?.present ?? "—"}</td>
                      <td data-label="Ausentes">{session.summary?.absent ?? "—"}</td>
                      <td data-label="Estado">
                        <SessionPhaseBadge phase={session.phase} longLabel />
                      </td>
                      <td data-label="Pagos">
                        {session.summary
                          ? `${session.summary.paid} pagaron / ${session.summary.pending + session.summary.overdue} pendientes`
                          : "—"}
                      </td>
                      <td className={styles.actionCell}>
                        <Link href={`/professor/sessions/${session.id}`} className={styles.rowLink}>
                          Ver clase
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
