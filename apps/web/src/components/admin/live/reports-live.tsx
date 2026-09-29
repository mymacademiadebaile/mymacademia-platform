"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, UsersRound } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import type { Branch } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type ReportOverview = {
  period: string;
  students: {
    active: number;
    newInPeriod: number;
  };
  professors: {
    active: number;
  };
  classes: {
    active: number;
    totalCapacity: number;
    occupied: number;
  };
  financial: {
    totalAmount: number;
    collectedAmount: number;
    pendingAmount: number;
    overdueAmount: number;
    cancelledAmount: number;
    count: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    cancelledCount: number;
  };
  occupancy: Array<{
    id: string;
    name: string;
    capacity: number;
    occupied: number;
    available: number;
    occupancyPercent: number;
    disciplines: string[];
  }>;
};

function currentPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function ReportsLive() {
  const [data, setData] = useState<ReportOverview | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ period });
      if (branchId) params.set("branchId", branchId);

      const [overview, branchList] = await Promise.all([
        apiFetch<ReportOverview>(`/admin/reports/overview?${params.toString()}`),
        apiFetch<Branch[]>("/admin/branches")
      ]);

      setData(overview);
      setBranches(branchList);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [period, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generalOccupancy = useMemo(() => {
    if (!data?.classes.totalCapacity) return 0;
    return Math.round((data.classes.occupied / data.classes.totalCapacity) * 100);
  }, [data]);

  function exportExcel() {
    const params = new URLSearchParams({ period });
    if (branchId) params.set("branchId", branchId);
    window.open(apiUrl(`/admin/reports/export.xlsx?${params.toString()}`), "_blank");
  }

  return (
    <>
      <PageHeader
        eyebrow="ANÁLISIS"
        title="Reportes"
        description="Indicadores reales por período y sede, con exportación Excel."
      />

      <div className={styles.reportToolbar}>
        <label>
          <span>Período</span>
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
        </label>
        <label>
          <span>Sede</span>
          <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">Todas las sedes</option>
            {branches.map((branch) => (
              <option key={branch._id} value={branch._id}>{branch.name}</option>
            ))}
          </select>
        </label>
        <button className={styles.primary} onClick={exportExcel}>
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !data && <LoadingBlock label="Calculando reportes..." />}

      {data && (
        <>
          <div className={styles.liveGrid4}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Cobrado</span>
              <strong className={styles.cardValue}>$ {data.financial.collectedAmount.toLocaleString("es-AR")}</strong>
              <span className={styles.cardDetail}>{data.financial.paidCount} pagos en {data.period}</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Deuda vencida</span>
              <strong className={styles.cardValue}>$ {data.financial.overdueAmount.toLocaleString("es-AR")}</strong>
              <span className={styles.cardDetail}>{data.financial.overdueCount} cuotas vencidas</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Alumnos activos</span>
              <strong className={styles.cardValue}>{data.students.active}</strong>
              <span className={styles.cardDetail}>+{data.students.newInPeriod} altas en el período</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Ocupación general</span>
              <strong className={styles.cardValue}>{generalOccupancy}%</strong>
              <span className={styles.cardDetail}>
                {data.classes.occupied} de {data.classes.totalCapacity} lugares
              </span>
            </article>
          </div>

          <div className={styles.liveGrid3}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Profesores activos</span>
              <strong className={styles.cardValue}>{data.professors.active}</strong>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Clases activas</span>
              <strong className={styles.cardValue}>{data.classes.active}</strong>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Pendiente no vencido</span>
              <strong className={styles.cardValue}>$ {data.financial.pendingAmount.toLocaleString("es-AR")}</strong>
              <span className={styles.cardDetail}>{data.financial.pendingCount} cuotas</span>
            </article>
          </div>

          <section className={styles.historySection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>CAPACIDAD</span>
                <h3>Ocupación por clase</h3>
                <p>Ordenada de mayor a menor ocupación.</p>
              </div>
              <BarChart3 size={22} color="#5b21b6" />
            </div>

            <div className={styles.listCard}>
              {data.occupancy.length === 0 && (
                <div className={styles.stateBlock}>No hay clases activas para estos filtros.</div>
              )}
              {data.occupancy.map((item) => (
                <div className={styles.listRow} key={item.id}>
                  <span className={styles.avatar}><UsersRound size={16} /></span>
                  <span className={styles.rowBody}>
                    <strong>{item.name}</strong>
                    <small>{item.disciplines.join(", ") || "Sin disciplina"}</small>
                    <div className={styles.reportProgress}>
                      <span style={{ width: `${Math.min(100, item.occupancyPercent)}%` }} />
                    </div>
                  </span>
                  <strong>{item.occupied}/{item.capacity}</strong>
                  <span className={item.occupancyPercent >= 90 ? styles.pillWarn : styles.pill}>
                    {item.occupancyPercent}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
