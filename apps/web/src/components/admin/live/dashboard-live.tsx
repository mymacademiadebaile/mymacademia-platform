"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Summary } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

export function DashboardLive() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      setData(await apiFetch<Summary>("/admin/summary"));
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
        description="Datos reales de alumnos, profesores, clases y cobranzas."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {!error && !data && <LoadingBlock label="Cargando resumen..." />}

      {data && (
        <>
          <div className={styles.liveGrid4}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Alumnos activos</span>
              <strong className={styles.cardValue}>{data.activeStudents}</strong>
              <span className={styles.cardDetail}>Registros actualmente activos</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Profesores activos</span>
              <strong className={styles.cardValue}>{data.activeProfessors}</strong>
              <span className={styles.cardDetail}>Con acceso al sistema</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Clases activas</span>
              <strong className={styles.cardValue}>{data.activeClasses}</strong>
              <span className={styles.cardDetail}>{data.activeEnrollments} inscripciones activas</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Cobrado registrado</span>
              <strong className={styles.cardValue}>
                $ {data.collectedAmount.toLocaleString("es-AR")}
              </strong>
              <span className={styles.cardDetail}>
                {data.overduePayments} vencidas · {data.pendingPayments} pendientes
              </span>
            </article>
          </div>

          <div className={styles.notice}>
            Este dashboard ya está leyendo MongoDB a través de la API. Las métricas dejan de ser demostrativas en cuanto cargues los primeros registros.
          </div>
        </>
      )}
    </>
  );
}
