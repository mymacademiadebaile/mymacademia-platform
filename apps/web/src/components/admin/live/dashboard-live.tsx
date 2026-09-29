"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CreditCard, UsersRound } from "lucide-react";
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

export function DashboardLive() {
  const [data, setData] = useState<Summary | null>(null);
  const [report, setReport] = useState<ReportOverview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const [summary, overview] = await Promise.all([
        apiFetch<Summary>("/admin/summary"),
        apiFetch<ReportOverview>("/admin/reports/overview")
      ]);
      setData(summary);
      setReport(overview);
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
        description="Actividad operativa y financiera tomada directamente de MongoDB."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {!error && (!data || !report) && <LoadingBlock label="Cargando resumen..." />}

      {data && report && (
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
              <span className={styles.cardLabel}>Clases activas</span>
              <strong className={styles.cardValue}>{data.activeClasses}</strong>
              <span className={styles.cardDetail}>{data.activeEnrollments} inscripciones activas</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Cobrado este mes</span>
              <strong className={styles.cardValue}>$ {report.financial.collectedAmount.toLocaleString("es-AR")}</strong>
              <span className={styles.cardDetail}>{report.financial.paidCount} pagos registrados</span>
            </article>
          </div>

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
                      <span style={{ width: `${Math.min(100, item.occupancyPercent)}%` }} />
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
            El dashboard usa datos persistidos. Los resultados cambian al cargar alumnos, clases, inscripciones y pagos reales.
          </div>
        </>
      )}
    </>
  );
}
