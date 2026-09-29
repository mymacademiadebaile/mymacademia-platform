"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  History,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UsersRound
} from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { DanceClass, Paginated, Student } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type EmailAudience = "ALL" | "DEBT" | "CLASS";
type HistoryStatus = "PENDING" | "SENT" | "FAILED" | "OPENED";
type HistoryItem = {
  _id: string;
  channel: "EMAIL" | "WHATSAPP";
  type: "DEBT_REMINDER" | "CLASS_REMINDER" | "PROMOTION";
  destination: string;
  subject?: string;
  message: string;
  status: HistoryStatus;
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
  studentId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
};

export function CommunicationsLive() {
  const { toast, confirm } = useAdminFeedback();
  const [channel, setChannel] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [audience, setAudience] = useState<EmailAudience>("ALL");
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historySearch, setHistorySearch] = useState("");
  const [historyChannel, setHistoryChannel] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [recipientSample, setRecipientSample] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [retryingId, setRetryingId] = useState("");

  const loadBase = useCallback(async () => {
    try {
      const [classList, studentList] = await Promise.all([
        apiFetch<DanceClass[]>("/admin/classes"),
        apiFetch<Paginated<Student>>("/admin/students?limit=100")
      ]);
      setClasses(classList.filter((item) => item.status === "ACTIVE"));
      setStudents(studentList.items.filter((item) => item.isActive));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);

    try {
      const params = new URLSearchParams({ limit: "50" });
      if (historySearch) params.set("q", historySearch);
      if (historyChannel) params.set("channel", historyChannel);
      if (historyStatus) params.set("status", historyStatus);

      const result = await apiFetch<Paginated<HistoryItem>>(
        `/admin/communications/history?${params.toString()}`
      );
      setHistory(result.items);
      setHistoryTotal(result.total);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoadingHistory(false);
    }
  }, [historySearch, historyChannel, historyStatus]);

  const loadPreview = useCallback(async () => {
    if (audience === "CLASS" && !classId) {
      setRecipientCount(null);
      setRecipientSample([]);
      return;
    }

    try {
      const result = await apiFetch<{
        recipients: number;
        sample: Array<{ id: string; name: string; email?: string }>;
      }>("/admin/communications/preview", {
        method: "POST",
        body: JSON.stringify({
          audience,
          classId: audience === "CLASS" ? classId : undefined
        })
      });

      setRecipientCount(result.recipients);
      setRecipientSample(result.sample);
    } catch {
      setRecipientCount(null);
      setRecipientSample([]);
    }
  }, [audience, classId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHistory(), 180);
    return () => window.clearTimeout(timer);
  }, [loadHistory]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const studentsWithPhone = useMemo(
    () => students.filter((student) => Boolean(student.phone)),
    [students]
  );

  async function sendEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    if (recipientCount === 0) {
      setError("No hay destinatarios con email para esta selección.");
      return;
    }

    const approved = await confirm({
      title: "Confirmar envío",
      description: "Vas a enviar este email a " + (recipientCount ?? "los") + " destinatarios.",
      confirmLabel: "Enviar email"
    });

    if (!approved) return;

    setSending(true);
    setError("");

    try {
      const result = await apiFetch<{ recipients: number; sent: number; failed: number }>(
        "/admin/communications/email",
        {
          method: "POST",
          body: JSON.stringify({
            audience,
            classId: audience === "CLASS" ? classId : undefined,
            subject: form.get("subject"),
            message: form.get("message")
          })
        }
      );

      toast({
        title: "Envío terminado",
        description: result.sent + " enviados, " + result.failed + " fallidos sobre " + result.recipients + " destinatarios.",
        tone: result.failed > 0 ? "warning" : "success"
      });
      event.currentTarget.reset();
      await Promise.all([loadHistory(), loadPreview()]);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  async function openWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = String(form.get("studentId") ?? "");
    const message = String(form.get("message") ?? "");

    setError("");

    try {
      const result = await apiFetch<{ url: string }>("/admin/communications/whatsapp", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          message,
          type: "PROMOTION"
        })
      });

      window.open(result.url, "_blank", "noopener,noreferrer");
      toast("WhatsApp abierto y registrado en el historial");
      await loadHistory();
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }

  async function retryEmail(id: string) {
    setRetryingId(id);
    setError("");

    try {
      await apiFetch(`/admin/communications/history/${id}/retry`, {
        method: "POST"
      });
      toast("Email reenviado correctamente");
      await loadHistory();
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setRetryingId("");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="COMUNICACIÓN"
        title="Mensajes y recordatorios"
        description="Email real con Gmail/Nodemailer, WhatsApp precargado e historial auditable."
      />

      {error && <ErrorBlock message={error} onRetry={() => setError("")} />}

      <div className={styles.liveGrid3} style={{ gridTemplateColumns: "1fr 1fr" }}>
        <button
          className={styles.card}
          style={{ cursor: "pointer", textAlign: "left", borderColor: channel === "EMAIL" ? "#a78bfa" : undefined }}
          onClick={() => setChannel("EMAIL")}
        >
          <Mail size={22} color="#5b21b6" />
          <strong style={{ display: "block", marginTop: 10 }}>Email</strong>
          <span className={styles.cardDetail}>Envíos segmentados con trazabilidad por destinatario.</span>
        </button>
        <button
          className={styles.card}
          style={{ cursor: "pointer", textAlign: "left", borderColor: channel === "WHATSAPP" ? "#a78bfa" : undefined }}
          onClick={() => setChannel("WHATSAPP")}
        >
          <MessageCircle size={22} color="#5b21b6" />
          <strong style={{ display: "block", marginTop: 10 }}>WhatsApp</strong>
          <span className={styles.cardDetail}>Abre la conversación y registra la acción en el sistema.</span>
        </button>
      </div>

      {channel === "EMAIL" ? (
        <form className={styles.card} onSubmit={sendEmail}>
          <div className={styles.communicationHeader}>
            <div>
              <span className={styles.cardLabel}>NUEVO ENVÍO</span>
              <strong>Preparar email</strong>
            </div>
            <div className={styles.recipientCounter}>
              <UsersRound size={17} />
              <span>
                <strong>{recipientCount ?? "—"}</strong>
                destinatarios
              </span>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Destinatarios</span>
              <select
                value={audience}
                onChange={(event) => {
                  setAudience(event.target.value as EmailAudience);
                  if (event.target.value !== "CLASS") setClassId("");
                }}
              >
                <option value="ALL">Todos los alumnos con email</option>
                <option value="DEBT">Alumnos con deuda pendiente</option>
                <option value="CLASS">Alumnos de una clase</option>
              </select>
            </label>

            {audience === "CLASS" && (
              <label className={styles.field}>
                <span>Clase</span>
                <select
                  value={classId}
                  onChange={(event) => setClassId(event.target.value)}
                  required
                >
                  <option value="">Seleccionar clase</option>
                  {classes.map((item) => (
                    <option value={item._id} key={item._id}>{item.name}</option>
                  ))}
                </select>
              </label>
            )}

            <label className={styles.fieldWide}>
              <span>Asunto</span>
              <input name="subject" required placeholder="Ej. Recordatorio de clase" />
            </label>
            <label className={styles.fieldWide}>
              <span>Mensaje</span>
              <textarea
                name="message"
                rows={7}
                required
                placeholder="Podés usar {{nombre}} para personalizar el saludo."
              />
            </label>
          </div>

          {recipientSample.length > 0 && (
            <div className={styles.recipientPreview}>
              <strong>Vista previa de destinatarios</strong>
              <span>
                {recipientSample.map((item) => item.name).join(", ")}
                {(recipientCount ?? 0) > recipientSample.length ? "…" : ""}
              </span>
            </div>
          )}

          <div style={{ marginTop: 15 }}>
            <button className={styles.primary} disabled={sending || recipientCount === 0}>
              <Send size={16} />
              {sending ? "Enviando..." : "Enviar email"}
            </button>
          </div>
        </form>
      ) : (
        <form className={styles.card} onSubmit={openWhatsApp}>
          <div className={styles.communicationHeader}>
            <div>
              <span className={styles.cardLabel}>MENSAJE INDIVIDUAL</span>
              <strong>Abrir WhatsApp</strong>
            </div>
            <MessageCircle size={22} color="#5b21b6" />
          </div>
          <div className={styles.formGrid}>
            <label className={styles.fieldWide}>
              <span>Alumno</span>
              <select name="studentId" required defaultValue="">
                <option value="" disabled>Seleccionar alumno</option>
                {studentsWithPhone.map((item) => (
                  <option value={item._id} key={item._id}>
                    {item.firstName} {item.lastName} · {item.phone}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.fieldWide}>
              <span>Mensaje</span>
              <textarea name="message" rows={7} required placeholder="Escribí el mensaje..." />
            </label>
          </div>
          <div style={{ marginTop: 15 }}>
            <button className={styles.primary}>
              <MessageCircle size={16} />
              Abrir WhatsApp
            </button>
          </div>
        </form>
      )}

      <section className={styles.historySection}>
        <div className={styles.sectionTitleRow}>
          <div>
            <span className={styles.cardLabel}>TRAZABILIDAD</span>
            <h3>Historial de comunicaciones</h3>
            <p>{historyTotal} registros encontrados</p>
          </div>
          <History size={22} color="#5b21b6" />
        </div>

        <div className={styles.historyFilters}>
          <div className={styles.searchInline}>
            <Search size={16} />
            <input
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
              placeholder="Buscar destino, asunto o mensaje..."
            />
          </div>
          <select value={historyChannel} onChange={(event) => setHistoryChannel(event.target.value)}>
            <option value="">Todos los canales</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}>
            <option value="">Todos los estados</option>
            <option value="SENT">Enviado</option>
            <option value="FAILED">Fallido</option>
            <option value="OPENED">WhatsApp abierto</option>
            <option value="PENDING">Pendiente</option>
          </select>
        </div>

        {loadingHistory && <LoadingBlock label="Cargando historial..." />}

        {!loadingHistory && (
          <div className={styles.listCard}>
            {history.length === 0 && (
              <div className={styles.stateBlock}>Todavía no hay comunicaciones para estos filtros.</div>
            )}
            {history.map((item) => {
              const studentName = item.studentId
                ? `${item.studentId.firstName} ${item.studentId.lastName}`
                : item.destination;

              return (
                <div className={styles.listRow} key={item._id}>
                  <span className={styles.avatar}>
                    {item.channel === "EMAIL" ? <Mail size={16} /> : <MessageCircle size={16} />}
                  </span>
                  <span className={styles.rowBody}>
                    <strong>{studentName}</strong>
                    <small>
                      {item.subject || item.message.slice(0, 70)}
                    </small>
                    <small>
                      <Clock3 size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
                      {new Date(item.createdAt).toLocaleString("es-AR")}
                    </small>
                  </span>
                  <span
                    className={
                      item.status === "SENT"
                        ? styles.pill
                        : item.status === "FAILED"
                          ? styles.pillWarn
                          : styles.pillOff
                    }
                  >
                    {item.status === "SENT"
                      ? "Enviado"
                      : item.status === "FAILED"
                        ? "Fallido"
                        : item.status === "OPENED"
                          ? "Abierto"
                          : "Pendiente"}
                  </span>
                  {item.status === "FAILED" && item.channel === "EMAIL" && (
                    <button
                      className={styles.inlineAction}
                      disabled={retryingId === item._id}
                      onClick={() => void retryEmail(item._id)}
                    >
                      <RefreshCw size={14} />
                      {retryingId === item._id ? "..." : "Reintentar"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
