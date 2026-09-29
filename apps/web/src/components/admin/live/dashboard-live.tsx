"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock3,
  CreditCard,
  UsersRound
} from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Summary } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type ReportOverview = {
  period: string;
  students: { active: number; newInPeriod: number };
  professors: { active: number };
  classes: { active: number; totalCapacity: number; occupied: number };
  financial: {
    collectedAmount: number;
    pendingAmount: number;
    overdueAmount: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
  };
  occupancy: Array<{
    id: string;
    name: string;
    capacity: number;
    occupied: number;
    occupancyPercent: number;
  }>;
};

type TodaySession = {
  id: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  class: {
    id: string;
    name: string;
    capacity: number;
    billingMode: "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
    pricePerClass: number;
    monthlyPrice: number;
    professors: Array<{
      id: string;
      displayName: string;
      avatarUrl?: string;
    }>;
  };
  enrolledCount: number;
};

type TodayResponse = {
  date: string;
  items: TodaySession[];
};

function localDateValue() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function billingSummary(session: TodaySession) {
  if (session.class.billingMode === "FREE") return "Sin cargo";
  if (session.class.billingMode === "PER_CLASS") {
    return "$ " + session.class.pricePerClass.toLocaleString("es-AR") + " / clase";
  }
  if (session.class.billingMode === "MONTHLY") {
    return "$ " + session.class.monthlyPrice.toLocaleString("es-AR") + " / mes";
  }
  return "Por clase o mensual";
}

export function DashboardLive() {
  const [data, setData] = useState<Summary | null>(null);
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const date = localDateValue();
      const [summary, overview, todayResponse] = await Promise.all([
        apiFetch<Summary>("/admin/summary"),
        apiFetch<ReportOverview>("/admin/reports/overview"),
        apiFetch<TodayResponse>("/admin/sessions?date=" + date)
      ]);
      setData(summary);
      setReport(overview);
      setToday(todayResponse);
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        eyebrow="RESUMEN GENERAL"
        title="Así viene la academia hoy"
        description="Agenda operativa, alumnos y finanzas en un solo lugar."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {!error && (!data || !report || !today) && <LoadingBlock label="Cargando resumen..." />}

      {data && report && today && (
        <>
          <div className={styles.liveGrid4}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Alumnos activos</span>
              <strong className={styles.cardValue}>{data.activeStudents}</strong>
              <span className={styles.cardDetail}>+{report.students.newInPeriod} altas este mes</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Profesores activos</span>
              <strong className={styles.cardValue}>{data.activeProfessors}</strong>
              <span className={styles.cardDetail}>Equipo con acceso habilitado</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Clases de hoy</span>
              <strong className={styles.cardValue}>{today.items.length}</strong>
              <span className={styles.cardDetail}>{data.activeClasses} clases activas configuradas</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Cobrado este mes</span>
              <strong className={styles.cardValue}>$ {report.financial.collectedAmount.toLocaleString("es-AR")}</strong>
              <span className={styles.cardDetail}>{report.financial.paidCount} pagos registrados</span>
            </article>
          </div>

          <section className={styles.todaySection}>
            <div className={styles.todaySectionHeader}>
              <div>
                <span className={styles.cardLabel}>HOY</span>
                <h3>Clases del día</h3>
                <p>
                  {new Date(today.date + "T12:00:00").toLocaleDateString("es-AR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long"
                  })}
                </p>
              </div>
              <CalendarDays size={22} />
            </div>

            {today.items.length === 0 ? (
              <div className={styles.todayEmpty}>No hay clases programadas para hoy.</div>
            ) : (
              <div className={styles.todayList}>
                {today.items.map((session) => (
                  <Link
                    href={"/admin/sessions/" + session.id}
                    className={styles.todayCard}
                    key={session.id}
                  >
                    <span className={styles.todayTime}>
                      <Clock3 size={15} />
                      <strong>{session.startTime}</strong>
                      <small>{session.endTime}</small>
                    </span>
                    <span className={styles.todayBody}>
                      <strong>{session.class.name}</strong>
                      <small>
                        {session.class.professors.map((professor) => professor.displayName).join(", ") || "Sin profesor asignado"}
                      </small>
                    </span>
                    <span className={styles.todayMeta}>
                      <strong>{session.enrolledCount}/{session.class.capacity}</strong>
                      <small>alumnos</small>
                    </span>
                    <span className={styles.todayBilling}>{billingSummary(session)}</span>
                    <span className={styles.todayState} data-status={session.status}>
                      {session.status === "COMPLETED" ? "Finalizada" : session.status === "CANCELLED" ? "Cancelada" : "Abrir"}
                    </span>
                    <ArrowRight size={15} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className={styles.dashboardGrid}>
            <section className={styles.card}>
              <div className={styles.communicationHeader}>
                <div>
                  <span className={styles.cardLabel}>FINANZAS</span>
                  <strong>Estado del período {report.period}</strong>
                </div>
                <CreditCard size={21} color="#5b21b6" />
              </div>
              <div className={styles.dashboardFinance}>
                <div>
                  <span>Pendiente</span>
                  <strong>$ {report.financial.pendingAmount.toLocaleString("es-AR")}</strong>
                </div>
                <div>
                  <span>Vencido</span>
                  <strong>$ {report.financial.overdueAmount.toLocaleString("es-AR")}</strong>
                </div>
              </div>
              <Link href="/admin/payments" className={styles.cardFooterLink}>
                Ir a pagos <ArrowRight size={14} />
              </Link>
            </section>

            <section className={styles.card}>
              <div className={styles.communicationHeader}>
                <div>
                  <span className={styles.cardLabel}>OCUPACIÓN</span>
                  <strong>Clases con mayor ocupación</strong>
                </div>
                <BarChart3 size={21} color="#5b21b6" />
              </div>
              <div className={styles.dashboardOccupancy}>
                {report.occupancy.slice(0, 4).map((item) => (
                  <div key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.occupied}/{item.capacity}</small>
                    </span>
                    <div className={styles.reportProgress}>
                      <span style={{ width: Math.min(100, item.occupancyPercent) + "%" }} />
                    </div>
                  </div>
                ))}
                {report.occupancy.length === 0 && (
                  <span className={styles.cardDetail}>Todavía no hay clases activas.</span>
                )}
              </div>
              <Link href="/admin/reports" className={styles.cardFooterLink}>
                Ver reportes <ArrowRight size={14} />
              </Link>
            </section>
          </div>

          <div className={styles.notice}>
            <UsersRound size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            La agenda de hoy se genera desde los horarios configurados y mantiene cada clase como una ocurrencia independiente.
          </div>
        </>
      )}
    </>
  );
}
