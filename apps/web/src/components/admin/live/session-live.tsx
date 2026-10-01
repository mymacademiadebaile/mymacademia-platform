"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gift,
  UserCheck,
  UserX,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type AttendanceStatus = "EXPECTED" | "PRESENT" | "ABSENT";
type BillingType = "PER_CLASS" | "MONTHLY" | "FREE";
type PaymentState = "FREE" | "NONE" | "PENDING" | "OVERDUE" | "PAID";

type SessionParticipant = {
  studentId: string;
  student: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  participantType: "ENROLLMENT" | "TRIAL";
  enrollmentId?: string;
  trialId?: string;
  attendanceStatus: AttendanceStatus;
  billingType: BillingType;
  payment: {
    status: PaymentState;
    paymentId?: string;
    paymentType?: "PER_CLASS" | "MONTHLY" | null;
    amount: number;
    paymentMethod?: string;
    receiptNumber?: string;
  };
};

type SessionDetail = {
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
  participants: SessionParticipant[];
  alternatives: Array<{ id: string; startTime: string; endTime: string }>;
};

function attendanceLabel(status: AttendanceStatus) {
  if (status === "PRESENT") return "Presente";
  if (status === "ABSENT") return "Ausente";
  return "Esperado";
}

function billingLabel(type: BillingType) {
  if (type === "MONTHLY") return "Mensual";
  if (type === "FREE") return "Sin cargo";
  return "Por clase";
}

function paymentLabel(participant: SessionParticipant) {
  const { status } = participant.payment;

  if (status === "FREE") return participant.participantType === "TRIAL" ? "Prueba gratis" : "Sin cargo";
  if (status === "PAID") {
    // The covering payment can differ from the current billing type (history is kept).
    return (participant.payment.paymentType ?? participant.billingType) === "MONTHLY"
      ? "Mensual al día"
      : "Clase pagada";
  }
  if (status === "OVERDUE") return "Vencido";
  if (status === "PENDING") return "Pendiente";
  return participant.billingType === "MONTHLY" ? "Mensual pendiente" : "Pendiente de cobro";
}

function paymentTone(status: PaymentState) {
  if (status === "PAID" || status === "FREE") return "ok";
  if (status === "OVERDUE") return "danger";
  return "pending";
}

export function SessionLive({ id }: { id: string }) {
  const { toast, confirm } = useAdminFeedback();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [paying, setPaying] = useState<SessionParticipant | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [moving, setMoving] = useState<SessionParticipant | null>(null);
  const [busyStudentId, setBusyStudentId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      setData(await apiFetch<SessionDetail>("/admin/sessions/" + id));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const participants = data?.participants ?? [];
    return {
      expected: participants.length,
      present: participants.filter((item) => item.attendanceStatus === "PRESENT").length,
      absent: participants.filter((item) => item.attendanceStatus === "ABSENT").length,
      toCollect: participants.filter(
        (item) => item.payment.status === "NONE" || item.payment.status === "PENDING" || item.payment.status === "OVERDUE"
      ).length
    };
  }, [data]);

  async function setAttendance(
    participant: SessionParticipant,
    status: AttendanceStatus
  ) {
    if (participant.attendanceStatus === status) return;

    setBusyStudentId(participant.studentId);

    try {
      await apiFetch(
        "/admin/sessions/" + id + "/attendance/" + participant.studentId,
        {
          method: "PATCH",
          body: JSON.stringify({ status })
        }
      );

      setData((current) =>
        current
          ? {
              ...current,
              participants: current.participants.map((item) =>
                item.studentId === participant.studentId
                  ? { ...item, attendanceStatus: status }
                  : item
              )
            }
          : current
      );

      toast(
        status === "PRESENT"
          ? "Asistencia marcada como presente"
          : status === "ABSENT"
            ? "Asistencia marcada como ausente"
            : "Asistencia restablecida"
      );
    } catch (requestError) {
      toast({
        title: "No se pudo actualizar la asistencia",
        description: apiMessage(requestError),
        tone: "error"
      });
    } finally {
      setBusyStudentId("");
    }
  }

  function openPayment(participant: SessionParticipant) {
    setPaying(participant);
    setPaymentAmount(participant.payment.amount);
  }

  async function registerPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paying || !data) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);

    try {
      if (paying.payment.paymentId) {
        await apiFetch(
          "/admin/payments/" + paying.payment.paymentId + "/mark-paid",
          {
            method: "POST",
            body: JSON.stringify({
              paymentMethod: form.get("paymentMethod"),
              paidAt: form.get("paidAt") || undefined
            })
          }
        );
      } else {
        await apiFetch("/admin/payments/quick-charge", {
          method: "POST",
          body: JSON.stringify({
            studentId: paying.studentId,
            classId: data.class.id,
            paymentType: paying.billingType,
            sessionId: paying.billingType === "PER_CLASS" ? data.id : undefined,
            classDate:
              paying.billingType === "PER_CLASS"
                ? data.sessionDate
                : undefined,
            period:
              paying.billingType === "MONTHLY"
                ? data.sessionDate.slice(0, 7)
                : undefined,
            amount: paymentAmount,
            paymentMethod: form.get("paymentMethod"),
            paidAt: form.get("paidAt") || undefined
          })
        });
      }

      toast("Cobro registrado");
      setPaying(null);
      await load();
    } catch (requestError) {
      toast({
        title: "No se pudo registrar el cobro",
        description: apiMessage(requestError),
        tone: "error"
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function completeSession() {
    if (!data) return;

    const approved = await confirm({
      title: "Finalizar clase",
      description:
        "La clase quedará marcada como finalizada. Podrás seguir consultando asistencias y pagos desde su historial.",
      confirmLabel: "Finalizar clase"
    });
    if (!approved) return;

    try {
      await apiFetch("/admin/sessions/" + id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" })
      });

      setData((current) =>
        current ? { ...current, status: "COMPLETED" } : current
      );
      toast("Clase finalizada");
    } catch (requestError) {
      toast({
        title: "No se pudo finalizar la clase",
        description: apiMessage(requestError),
        tone: "error"
      });
    }
  }

  async function cancelBooking(participant: SessionParticipant) {
    if (!participant.enrollmentId) return;
    const approved = await confirm({
      title: "Cancelar turno",
      description: "Se libera el cupo de esta fecha. Se aplicará la anticipación configurada por la academia.",
      confirmLabel: "Cancelar turno",
      tone: "danger"
    });
    if (!approved) return;
    setBusyStudentId(participant.studentId);
    try {
      await apiFetch(`/admin/sessions/${id}/bookings/cancel`, {
        method: "POST", body: JSON.stringify({ enrollmentId: participant.enrollmentId })
      });
      toast("Turno cancelado y cupo liberado");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo cancelar el turno", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusyStudentId("");
    }
  }

  async function transferBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!moving?.enrollmentId) return;
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      await apiFetch(`/admin/sessions/${id}/bookings/transfer`, {
        method: "POST",
        body: JSON.stringify({ enrollmentId: moving.enrollmentId, targetSessionId: form.get("targetSessionId") })
      });
      setMoving(null);
      toast("Turno cambiado sin costo");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo cambiar el turno", description: apiMessage(requestError), tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  return (
    <>
      <Link href="/admin" className={styles.sessionBack}>
        <ArrowLeft size={15} /> Volver a hoy
      </Link>

      <PageHeader
        eyebrow="CLASE DEL DÍA"
        title={data.class.name}
        description="Asistencia y cobros de esta ocurrencia, sin salir de la clase."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <section className={styles.sessionHero}>
        <div>
          <span className={styles.sessionStatus} data-status={data.status}>
            {data.status === "COMPLETED"
              ? "Finalizada"
              : data.status === "CANCELLED"
                ? "Cancelada"
                : "Programada"}
          </span>
          <h2>{data.class.name}</h2>
          <p>
            <CalendarDays size={14} />
            {new Date(data.sessionDate + "T12:00:00").toLocaleDateString("es-AR", {
              weekday: "long",
              day: "2-digit",
              month: "long"
            })}
            <Clock3 size={14} />
            {data.startTime}–{data.endTime}
          </p>
          <small>
            {data.class.professors.map((professor) => professor.displayName).join(", ") || "Sin profesor asignado"}
          </small>
        </div>
        {data.status === "SCHEDULED" && (
          <button className={styles.sessionCompleteButton} onClick={() => void completeSession()}>
            <CheckCircle2 size={16} /> Finalizar clase
          </button>
        )}
      </section>

      <div className={styles.liveGrid4}>
        <article className={styles.card}>
          <UsersRound size={18} />
          <span className={styles.cardLabel}>Esperados</span>
          <strong className={styles.cardValue}>{stats.expected}</strong>
        </article>
        <article className={styles.card}>
          <UserCheck size={18} />
          <span className={styles.cardLabel}>Presentes</span>
          <strong className={styles.cardValue}>{stats.present}</strong>
        </article>
        <article className={styles.card}>
          <UserX size={18} />
          <span className={styles.cardLabel}>Ausentes</span>
          <strong className={styles.cardValue}>{stats.absent}</strong>
        </article>
        <article className={styles.card}>
          <CircleDollarSign size={18} />
          <span className={styles.cardLabel}>A cobrar</span>
          <strong className={styles.cardValue}>{stats.toCollect}</strong>
        </article>
      </div>

      <section className={styles.sessionParticipantsCard}>
        <div className={styles.sectionTitleRow}>
          <div>
            <span className={styles.cardLabel}>ALUMNOS</span>
            <h3>Gestión rápida de la clase</h3>
            <p>Marcá asistencia y cobrá desde la misma fila.</p>
          </div>
        </div>

        <div className={styles.sessionParticipantHead}>
          <span>Alumno</span>
          <span>Asistencia</span>
          <span>Modalidad</span>
          <span>Pago</span>
          <span />
        </div>

        {data.participants.length === 0 && (
          <div className={styles.stateBlock}>No hay alumnos ni pruebas programadas para esta clase.</div>
        )}

        {data.participants.map((participant) => {
          const fullName = participant.student.firstName + " " + participant.student.lastName;
          const canCollect =
            participant.billingType !== "FREE" &&
            participant.payment.status !== "PAID";

          return (
            <div className={styles.sessionParticipantRow} key={participant.studentId}>
              <span className={styles.sessionStudent}>
                <span className={styles.avatar}>
                  {participant.student.firstName[0]}{participant.student.lastName[0]}
                </span>
                <span>
                  <strong>{fullName}</strong>
                  <small>
                    {participant.participantType === "TRIAL" ? (
                      <><Gift size={11} /> Clase de prueba</>
                    ) : (
                      participant.student.phone || participant.student.email || "Sin contacto"
                    )}
                  </small>
                </span>
              </span>

              <span className={styles.attendanceActions}>
                <button
                  data-active={participant.attendanceStatus === "PRESENT"}
                  disabled={busyStudentId === participant.studentId}
                  onClick={() => void setAttendance(participant, "PRESENT")}
                >
                  <Check size={13} /> Presente
                </button>
                <button
                  data-active={participant.attendanceStatus === "ABSENT"}
                  disabled={busyStudentId === participant.studentId}
                  onClick={() => void setAttendance(participant, "ABSENT")}
                >
                  Ausente
                </button>
              </span>

              <span className={styles.sessionBilling}>
                {billingLabel(participant.billingType)}
              </span>

              <span
                className={styles.sessionPaymentState}
                data-tone={paymentTone(participant.payment.status)}
              >
                {paymentLabel(participant)}
                {participant.payment.amount > 0 && participant.payment.status !== "PAID" && (
                  <small>$ {participant.payment.amount.toLocaleString("es-AR")}</small>
                )}
              </span>

              <span className={styles.sessionRowAction}>
                {canCollect && (
                  <button onClick={() => openPayment(participant)}>
                    <CircleDollarSign size={14} /> Cobrar
                  </button>
                )}
                {!canCollect && participant.payment.status === "PAID" && (
                  <span className={styles.sessionPaidMark}>
                    <CheckCircle2 size={15} /> OK
                  </span>
                )}
                {participant.enrollmentId && data.status === "SCHEDULED" && (
                  <>
                    {data.alternatives.length > 0 && (
                      <button onClick={() => setMoving(participant)}>Cambiar turno</button>
                    )}
                    <button
                      className={styles.sessionCancelBooking}
                      disabled={busyStudentId === participant.studentId}
                      onClick={() => void cancelBooking(participant)}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </section>

      <LiveModal
        open={Boolean(moving)}
        title="Cambiar turno"
        description={moving ? `${moving.student.firstName} ${moving.student.lastName} · ${data.sessionDate}` : ""}
        submitting={submitting}
        onClose={() => setMoving(null)}
        onSubmit={transferBooking}
        submitLabel="Confirmar cambio"
      >
        <Field label="Nuevo horario" wide>
          <select name="targetSessionId" required defaultValue="">
            <option value="" disabled>Seleccionar turno disponible</option>
            {data.alternatives.map((alternative) => (
              <option key={alternative.id} value={alternative.id}>{alternative.startTime}–{alternative.endTime}</option>
            ))}
          </select>
        </Field>
        <div className={styles.modalHint}>El cambio no tiene costo ni límite; se confirma sólo si el turno conserva cupo.</div>
      </LiveModal>

      <LiveModal
        open={Boolean(paying)}
        title="Registrar cobro"
        description={
          paying
            ? paying.student.firstName +
              " " +
              paying.student.lastName +
              " · " +
              billingLabel(paying.billingType)
            : ""
        }
        submitting={submitting}
        onClose={() => setPaying(null)}
        onSubmit={registerPayment}
        submitLabel="Registrar cobro"
      >
        <Field label="Importe">
          <input
            type="number"
            min={1}
            step="0.01"
            value={paymentAmount || ""}
            onChange={(event) => setPaymentAmount(Number(event.target.value))}
            required
            disabled={Boolean(paying?.payment.paymentId)}
          />
        </Field>
        <Field label="Medio de pago">
          <select name="paymentMethod" defaultValue="CASH" required>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otro</option>
          </select>
        </Field>
        <Field label="Fecha de pago">
          <input name="paidAt" type="date" defaultValue={data.sessionDate} />
        </Field>
      </LiveModal>
    </>
  );
}
