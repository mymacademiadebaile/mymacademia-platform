"use client";

import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Mail,
  MessageCircle,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type NotificationItem = {
  id: string;
  channel: "EMAIL" | "WHATSAPP";
  type: "DEBT_REMINDER" | "CLASS_REMINDER" | "PROMOTION";
  status: "PENDING" | "SENT" | "FAILED" | "OPENED";
  subject?: string;
  message: string;
  destination: string;
  studentName?: string;
  sentAt?: string;
  createdAt: string;
};

type NotificationResponse = {
  attention: {
    overdueCount: number;
    overdueAmount: number;
    failedCommunications: number;
  };
  items: NotificationItem[];
};

function typeLabel(type: NotificationItem["type"]) {
  if (type === "DEBT_REMINDER") return "Recordatorio de pago";
  if (type === "CLASS_REMINDER") return "Recordatorio de clase";
  return "Promoción";
}

function statusLabel(status: NotificationItem["status"]) {
  if (status === "SENT") return "Enviado";
  if (status === "FAILED") return "Falló";
  if (status === "OPENED") return "Abierto";
  return "Pendiente";
}

export function NotificationsLive() {
  const [data, setData] = useState<NotificationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setData(await apiFetch<NotificationResponse>("/admin/notifications?limit=50"));
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        eyebrow="ACTIVIDAD"
        title="Notificaciones"
        description="Alertas operativas y últimos mensajes enviados desde la academia."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !data && <LoadingBlock />}

      {data && (
        <>
          <div className={styles.liveGrid3}>
            <article className={styles.card}>
              <span className={styles.cardLabel}>PAGOS VENCIDOS</span>
              <strong className={styles.cardValue}>{data.attention.overdueCount}</strong>
              <small className={styles.cardDetail}>
                $ {data.attention.overdueAmount.toLocaleString("es-AR")} pendientes
              </small>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>ENVÍOS CON ERROR</span>
              <strong className={styles.cardValue}>{data.attention.failedCommunications}</strong>
              <small className={styles.cardDetail}>Requieren revisión</small>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>HISTORIAL RECIENTE</span>
              <strong className={styles.cardValue}>{data.items.length}</strong>
              <small className={styles.cardDetail}>Últimas comunicaciones registradas</small>
            </article>
          </div>

          <section className={styles.card}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.cardLabel}>CENTRO DE NOTIFICACIONES</span>
                <h3>Actividad reciente</h3>
                <p>Los estados provienen del historial real de email y WhatsApp.</p>
              </div>
              <button className={styles.inlineAction} onClick={() => void load()}>
                <RefreshCw size={14} /> Actualizar
              </button>
            </div>

            <div className={styles.notificationHistory}>
              {data.items.length === 0 && (
                <div className={styles.stateBlock}>
                  <Bell size={22} />
                  <span>Todavía no hay notificaciones registradas.</span>
                </div>
              )}

              {data.items.map((item) => (
                <div className={styles.notificationHistoryRow} key={item.id}>
                  <span className={styles.notificationHistoryIcon} data-status={item.status}>
                    {item.status === "FAILED"
                      ? <AlertCircle size={17} />
                      : item.channel === "EMAIL"
                        ? <Mail size={17} />
                        : <MessageCircle size={17} />}
                  </span>
                  <span className={styles.rowBody}>
                    <strong>{item.studentName || item.destination}</strong>
                    <small>
                      {typeLabel(item.type)} · {item.subject || item.message}
                    </small>
                  </span>
                  <span className={item.status === "FAILED" ? styles.pillWarn : styles.pill}>
                    {item.status === "SENT" && <CheckCircle2 size={11} />}
                    {statusLabel(item.status)}
                  </span>
                  <time className={styles.notificationTime}>
                    {new Date(item.sentAt || item.createdAt).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </time>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
