"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Summary } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

export function ReportsLive() {
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
        eyebrow="ANÁLISIS"
        title="Reportes"
        description="Resumen operativo calculado desde los datos actuales del sistema."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {!error && !data && <LoadingBlock />}

      {data && (
        <>
          <div className={styles.liveGrid3}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Alumnos activos</span>
              <strong className={styles.cardValue}>{data.activeStudents}</strong>
              <span className={styles.cardDetail}>Base actual</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Inscripciones activas</span>
              <strong className={styles.cardValue}>{data.activeEnrollments}</strong>
              <span className={styles.cardDetail}>En {data.activeClasses} clases</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Cobrado registrado</span>
              <strong className={styles.cardValue}>$ {data.collectedAmount.toLocaleString("es-AR")}</strong>
              <span className={styles.cardDetail}>{data.overduePayments} cuotas vencidas</span>
            </article>
          </div>
          <div className={styles.notice}>
            La próxima capa de reporting agregará filtros por período y exportación Excel/PDF. Esta vista ya no usa números simulados.
          </div>
        </>
      )}
    </>
  );
}
