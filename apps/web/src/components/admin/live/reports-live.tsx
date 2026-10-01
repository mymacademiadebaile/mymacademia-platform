"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CalendarCheck2,
  CircleAlert,
  Download,
  ReceiptText,
  UsersRound,
  WalletCards
} from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import type { Branch } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type FinancialSummary = {
  totalAmount: number;
  count: number;
  collectedAmount: number;
  paidCount: number;
  pendingAmount: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  cancelledAmount: number;
  cancelledCount: number;
};

type ReportOverview = {
  range: {
    from: string;
    to: string;
    periods: string[];
    days: number;
  };
  students: {
    active: number;
    newInRange: number;
  };
  billing: {
    issued: FinancialSummary;
    byPaymentType: Array<FinancialSummary & { paymentType: "PER_CLASS" | "MONTHLY" }>;
  };
  cash: {
    collectedAmount: number;
    paidCount: number;
    byPaymentType: Array<{
      paymentType: "PER_CLASS" | "MONTHLY";
      amount: number;
      count: number;
    }>;
    byMethod: Array<{
      paymentMethod: "CASH" | "TRANSFER" | "CARD" | "OTHER";
      amount: number;
      count: number;
    }>;
  };
  activity: {
    sessions: number;
    completedSessions: number;
    scheduledSessions: number;
    cancelledSessions: number;
    attendance: {
      present: number;
      absent: number;
      expected: number;
      recorded: number;
    };
  };
  classPerformance: Array<{
    id: string;
    name: string;
    billingMode: "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE";
    capacity: number;
    sessions: {
      total: number;
      completed: number;
      scheduled: number;
      cancelled: number;
    };
    attendance: {
      present: number;
      absent: number;
      expected: number;
      recorded: number;
    };
    invoiced: { amount: number; count: number };
    collected: { amount: number; count: number };
    occupancy: { occupied: number; percent: number };
  }>;
};

type DateInputs = { from: string; to: string };

function academyDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentMonthRange(): DateInputs {
  const today = academyDate();
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`
  };
}

function money(value: number) {
  return `$ ${value.toLocaleString("es-AR")}`;
}

function paymentTypeLabel(type: "PER_CLASS" | "MONTHLY") {
  return type === "PER_CLASS" ? "Por clase" : "Mensual";
}

function billingModeLabel(mode: "PER_CLASS" | "MONTHLY" | "BOTH" | "FREE") {
  if (mode === "PER_CLASS") return "Por clase";
  if (mode === "MONTHLY") return "Mensual";
  if (mode === "BOTH") return "Ambas";
  return "Sin cargo";
}

function methodLabel(method: "CASH" | "TRANSFER" | "CARD" | "OTHER") {
  return {
    CASH: "Efectivo",
    TRANSFER: "Transferencia",
    CARD: "Tarjeta",
    OTHER: "Otro"
  }[method];
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${date}T12:00:00.000Z`));
}

export function ReportsLive() {
  const initialRange = useMemo(currentMonthRange, []);
  const [data, setData] = useState<ReportOverview | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [branchId, setBranchId] = useState("");
  const [appliedRange, setAppliedRange] = useState<DateInputs>(initialRange);
  const [appliedBranchId, setAppliedBranchId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams(appliedRange);
      if (appliedBranchId) params.set("branchId", appliedBranchId);

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
  }, [appliedBranchId, appliedRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const outstanding = data
    ? data.billing.issued.pendingAmount + data.billing.issued.overdueAmount
    : 0;

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from > to) {
      setError("La fecha de fin debe ser posterior a la fecha de inicio.");
      return;
    }
    setAppliedRange({ from, to });
    setAppliedBranchId(branchId);
  }

  function useCurrentMonth() {
    const range = currentMonthRange();
    setFrom(range.from);
    setTo(range.to);
    setAppliedRange(range);
    setAppliedBranchId(branchId);
  }

  function exportExcel() {
    const params = new URLSearchParams(appliedRange);
    if (appliedBranchId) params.set("branchId", appliedBranchId);
    window.open(apiUrl(`/admin/reports/export.xlsx?${params.toString()}`), "_blank");
  }

  return (
    <>
      <PageHeader
        eyebrow="ANÁLISIS OPERATIVO"
        title="Reportes"
        description="Una lectura separada de actividad, facturación y caja para clases por día, mensuales o mixtas."
      />

      <form className={styles.reportToolbar} onSubmit={applyFilters}>
        <label>
          <span>Desde</span>
          <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          <span>Hasta</span>
          <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
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
        <div className={styles.reportToolbarActions}>
          <button type="button" className={styles.secondary} onClick={useCurrentMonth}>
            Este mes
          </button>
          <button className={styles.primary} type="submit">Aplicar</button>
          <button className={styles.secondary} type="button" onClick={exportExcel} disabled={!data}>
            <Download size={16} /> Exportar Excel
          </button>
        </div>
      </form>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !data && <LoadingBlock label="Calculando reportes..." />}

      {data && (
        <>
          <section className={styles.reportContext} aria-label="Criterio del reporte">
            <div>
              <span className={styles.cardLabel}>PERÍODO ANALIZADO</span>
              <strong>{dateLabel(data.range.from)} — {dateLabel(data.range.to)}</strong>
              <small>{data.range.days} días · {data.students.newInRange} altas · {data.students.active} alumnos activos hoy</small>
            </div>
            <p>
              <CircleAlert size={16} aria-hidden="true" />
              Facturación se asigna a la clase o mensualidad; caja, a la fecha real del cobro. No se mezclan.
            </p>
          </section>

          <div className={styles.reportMetricGrid}>
            <article className={`${styles.card} ${styles.reportMetricCard}`}>
              <span className={styles.reportMetricIcon}><WalletCards size={18} /></span>
              <span className={styles.cardLabel}>COBRADO EN CAJA</span>
              <strong className={styles.cardValue}>{money(data.cash.collectedAmount)}</strong>
              <span className={styles.cardDetail}>{data.cash.paidCount} cobros registrados en estas fechas</span>
            </article>
            <article className={`${styles.card} ${styles.reportMetricCard}`}>
              <span className={styles.reportMetricIcon}><ReceiptText size={18} /></span>
              <span className={styles.cardLabel}>FACTURADO VIGENTE</span>
              <strong className={styles.cardValue}>{money(data.billing.issued.totalAmount)}</strong>
              <span className={styles.cardDetail}>{data.billing.issued.count} cargos; no incluye anulados</span>
            </article>
            <article className={`${styles.card} ${styles.reportMetricCard} ${styles.reportMetricDebt}`}>
              <span className={styles.reportMetricIcon}><Banknote size={18} /></span>
              <span className={styles.cardLabel}>POR COBRAR</span>
              <strong className={styles.cardValue}>{money(outstanding)}</strong>
              <span className={styles.cardDetail}>{data.billing.issued.overdueCount} vencidos · {data.billing.issued.pendingCount} pendientes</span>
            </article>
            <article className={`${styles.card} ${styles.reportMetricCard}`}>
              <span className={styles.reportMetricIcon}><CalendarCheck2 size={18} /></span>
              <span className={styles.cardLabel}>CLASES DEL DÍA</span>
              <strong className={styles.cardValue}>{data.activity.sessions}</strong>
              <span className={styles.cardDetail}>{data.activity.completedSessions} completadas · {data.activity.cancelledSessions} canceladas</span>
            </article>
          </div>

          <div className={styles.reportTwoColumns}>
            <section className={styles.reportSection}>
              <div className={styles.sectionTitleRow}>
                <div>
                  <span className={styles.cardLabel}>INGRESOS</span>
                  <h3>Facturación y caja por modalidad</h3>
                  <p>Permite comparar clases por día contra mensualidades sin falsear el período.</p>
                </div>
                <ReceiptText size={22} color="#5b21b6" />
              </div>
              <div className={styles.reportBreakdown}>
                {data.billing.byPaymentType.map((item) => {
                  const cash = data.cash.byPaymentType.find((candidate) => candidate.paymentType === item.paymentType);
                  return (
                    <article key={item.paymentType} className={styles.reportBreakdownRow}>
                      <div>
                        <strong>{paymentTypeLabel(item.paymentType)}</strong>
                        <small>{item.count} cargos del período · {cash?.count ?? 0} cobros</small>
                      </div>
                      <dl>
                        <div><dt>Facturado</dt><dd>{money(item.totalAmount)}</dd></div>
                        <div><dt>Caja</dt><dd>{money(cash?.amount ?? 0)}</dd></div>
                        <div className={item.overdueAmount ? styles.reportOverdue : undefined}><dt>Vencido</dt><dd>{money(item.overdueAmount)}</dd></div>
                      </dl>
                    </article>
                  );
                })}
              </div>
              {data.cash.byMethod.length > 0 && (
                <div className={styles.reportMethods}>
                  <span>CAJA POR MEDIO</span>
                  {data.cash.byMethod.map((item) => (
                    <small key={item.paymentMethod}>{methodLabel(item.paymentMethod)} <strong>{money(item.amount)}</strong></small>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.reportSection}>
              <div className={styles.sectionTitleRow}>
                <div>
                  <span className={styles.cardLabel}>OPERACIÓN</span>
                  <h3>Actividad y asistencia registrada</h3>
                  <p>Cuenta únicamente turnos creados y asistencias cargadas en Clase del día.</p>
                </div>
                <UsersRound size={22} color="#5b21b6" />
              </div>
              <div className={styles.reportActivityGrid}>
                <div><span>Completadas</span><strong>{data.activity.completedSessions}</strong></div>
                <div><span>Programadas</span><strong>{data.activity.scheduledSessions}</strong></div>
                <div><span>Presentes</span><strong>{data.activity.attendance.present}</strong></div>
                <div><span>Ausentes</span><strong>{data.activity.attendance.absent}</strong></div>
              </div>
              <p className={styles.reportFootnote}>
                {data.activity.attendance.recorded} asistencias cargadas. Las clases sin registro no se interpretan como ausencia.
              </p>
            </section>
          </div>

          <section className={styles.reportSection}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>DETALLE POR CLASE</span>
                <h3>Rendimiento académico y financiero</h3>
                <p>Facturado por la fecha de la clase o mensualidad; cobrado por fecha de pago. La ocupación es la actual.</p>
              </div>
            </div>

            {data.classPerformance.length === 0 ? (
              <div className={styles.stateBlock}>No hay actividad, cargos ni cobros asociados a este período.</div>
            ) : (
              <div className={styles.reportClassList}>
                <div className={styles.reportClassHead} aria-hidden="true">
                  <span>Clase</span><span>Actividad</span><span>Asistencia</span><span>Finanzas</span><span>Ocupación</span>
                </div>
                {data.classPerformance.map((item) => (
                  <article className={styles.reportClassRow} key={item.id}>
                    <div className={styles.reportClassName}>
                      <strong>{item.name}</strong>
                      <small>{billingModeLabel(item.billingMode)}</small>
                    </div>
                    <div><strong>{item.sessions.total}</strong><small>{item.sessions.completed} completadas · {item.sessions.cancelled} canceladas</small></div>
                    <div><strong>{item.attendance.present} presentes</strong><small>{item.attendance.absent} ausentes · {item.attendance.recorded} registros</small></div>
                    <div><strong>{money(item.invoiced.amount)}</strong><small>Cobrado: {money(item.collected.amount)}</small></div>
                    <div className={styles.reportClassOccupancy}>
                      <strong>{item.capacity ? `${item.occupancy.percent}%` : "—"}</strong>
                      <small>{item.capacity ? `${item.occupancy.occupied}/${item.capacity} actual` : "Sin cupo"}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
