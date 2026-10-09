"use client";

import {
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
  Megaphone,
  PauseCircle,
  Pencil,
  RotateCcw,
  UserPlus,
  X
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import liveStyles from "../live/live.module.css";
import styles from "./calendar.module.css";
import {
  COVERAGE_LABEL,
  METHOD_LABEL,
  PARTICIPANT_LABEL,
  SESSION_STATUS_LABEL,
  formatMoney,
  newIdempotencyKey,
  type AttendanceStatus,
  type CollectionMethod,
  type DanceSpace,
  type SessionDetail,
  type SessionParticipant
} from "./scheduling-types";

type Modal =
  | { kind: "reason"; status: "SUSPENDED" | "CANCELLED" }
  | { kind: "reschedule" }
  | { kind: "edit" }
  | { kind: "reopen" }
  | { kind: "participant" }
  | { kind: "notice" }
  | { kind: "collect"; participant: SessionParticipant; key: string }
  | null;

type ProfessorOption = { _id: string; displayName: string };

function coverageBadge(status: SessionParticipant["payment"]["status"]) {
  if (status === "PAID" || status === "FREE") return styles.badgeOk;
  if (status === "OVERDUE") return styles.badgeDanger;
  if (status === "PARTIAL" || status === "PENDING") return styles.badgeWarn;
  return styles.badgeOff;
}

export function SessionDrawer({
  sessionId,
  spaces,
  professors,
  onClose,
  onChanged
}: {
  sessionId: string;
  spaces: DanceSpace[];
  professors: ProfessorOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast, confirm } = useAdminFeedback();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentResults, setStudentResults] = useState<Array<{ _id: string; firstName: string; lastName: string }>>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<SessionDetail>("/admin/sessions/" + sessionId));
    } catch (error) {
      toast({ title: "No pudimos abrir la clase", description: apiMessage(error), tone: "error" });
      onClose();
    } finally {
      setLoading(false);
    }
  }, [sessionId, toast, onClose]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !modal) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, onClose]);

  useEffect(() => {
    if (modal?.kind !== "participant" || studentQuery.trim().length < 2) {
      setStudentResults([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const result = await apiFetch<{ items: Array<{ _id: string; firstName: string; lastName: string }> }>(
          "/admin/students?isActive=true&limit=10&q=" + encodeURIComponent(studentQuery.trim())
        );
        setStudentResults(result.items);
      } catch {
        setStudentResults([]);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [modal, studentQuery]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast({ title: success, tone: "success" });
      setModal(null);
      await load();
      onChanged();
    } catch (error) {
      toast({ title: "No se pudo completar", description: apiMessage(error), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (status: string, reason?: string) =>
    run(
      () => apiFetch("/admin/sessions/" + sessionId + "/status", { method: "PATCH", body: JSON.stringify({ status, reason }) }),
      "Clase " + SESSION_STATUS_LABEL[status as keyof typeof SESSION_STATUS_LABEL].toLowerCase()
    );

  async function complete() {
    const approved = await confirm({
      title: "Marcar como realizada",
      description: "La lista de alumnos de esta clase queda fija. Para modificarla después hay que reabrirla con un motivo.",
      confirmLabel: "Marcar realizada"
    });
    if (approved) await changeStatus("COMPLETED");
  }

  const attendance = (participant: SessionParticipant, status: AttendanceStatus) =>
    run(
      () =>
        apiFetch("/admin/sessions/" + sessionId + "/attendance/" + participant.studentId, {
          method: "PATCH",
          body: JSON.stringify({ status })
        }),
      status === "PRESENT" ? "Presente registrado" : status === "ABSENT" ? "Ausente registrado" : "Asistencia actualizada"
    );

  function submitReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "reason") return;
    const form = new FormData(event.currentTarget);
    void changeStatus(modal.status, String(form.get("reason") ?? ""));
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        apiFetch("/admin/sessions/" + sessionId + "/reschedule", {
          method: "POST",
          body: JSON.stringify({
            date: form.get("date"),
            startTime: form.get("startTime"),
            endTime: form.get("endTime"),
            spaceId: form.get("spaceId") || null,
            reason: form.get("reason")
          })
        }),
      "Clase reprogramada"
    );
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const professorIds = form.getAll("professorIds").map(String).filter(Boolean);
    void run(
      () =>
        apiFetch("/admin/sessions/" + sessionId, {
          method: "PATCH",
          body: JSON.stringify({
            startTime: form.get("startTime"),
            endTime: form.get("endTime"),
            spaceId: form.get("spaceId") || null,
            professorIds,
            notes: form.get("notes") ?? "",
            reason: form.get("reason") || undefined
          })
        }),
      "Cambios guardados para esta clase"
    );
  }

  function submitReopen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () => apiFetch("/admin/sessions/" + sessionId + "/reopen", { method: "POST", body: JSON.stringify({ reason: form.get("reason") }) }),
      "Clase reabierta"
    );
  }

  function submitParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent) {
      toast({ title: "Elegí un alumno", tone: "warning" });
      return;
    }
    const form = new FormData(event.currentTarget);
    void run(
      () =>
        apiFetch("/admin/sessions/" + sessionId + "/participants", {
          method: "POST",
          body: JSON.stringify({ studentId: selectedStudent, participantType: form.get("participantType"), note: form.get("note") || undefined })
        }),
      "Alumno agregado a esta clase"
    );
  }

  function submitNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(
      () => apiFetch("/admin/sessions/" + sessionId + "/notices", { method: "POST", body: JSON.stringify({ message: form.get("message") }) }),
      "Avisos preparados en Comunicaciones"
    );
  }

  function submitCollect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modal?.kind !== "collect") return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    void run(
      () =>
        apiFetch("/admin/billing/sessions/" + sessionId + "/collect", {
          method: "POST",
          body: JSON.stringify({
            studentId: modal.participant.studentId,
            method: form.get("method") as CollectionMethod,
            amount: amount > 0 ? amount : undefined,
            receivedAt: form.get("receivedAt") || undefined,
            idempotencyKey: modal.key
          })
        }),
      "Cobro registrado"
    );
  }

  const status = data?.status;
  const active = status === "SCHEDULED" || status === "IN_PROGRESS";
  const professorsShown = data?.professors?.length ? data.professors : data?.class.professors ?? [];
  const spaceName = data?.spaceId ? spaces.find((item) => item._id === data.spaceId)?.name ?? "Pista" : "Sin pista";

  return (
    <>
      <div className={styles.drawerBackdrop} onClick={onClose} />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="session-drawer-title">
        <div className={styles.drawerHeader}>
          <div>
            {data && (
              <div className={styles.badges}>
                <span className={styles.badge}>{SESSION_STATUS_LABEL[data.status]}</span>
                {data.origin === "EXTRA" && <span className={styles.badge}>Clase extra</span>}
                {data.origin === "RESCHEDULED" && <span className={styles.badge}>Reprogramada desde otra fecha</span>}
                {data.substitute && <span className={`${styles.badge} ${styles.badgeWarn}`}>Suplente</span>}
                {data.rosterFrozen && <span className={`${styles.badge} ${styles.badgeOff}`}>Lista cerrada</span>}
              </div>
            )}
            <h2 id="session-drawer-title">{data?.class.name ?? "Clase"}</h2>
            {data && (
              <p>
                {formatDateOnly(data.sessionDate, { weekday: "long", day: "numeric", month: "long" })} · {data.startTime}–{data.endTime} · {spaceName}
                {data.statusReason ? " · " + data.statusReason : ""}
              </p>
            )}
          </div>
          <button type="button" className={liveStyles.closeButton} onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className={styles.drawerBody}>
          {loading && !data ? (
            <div className={liveStyles.stateBlock}>
              <LoaderCircle className={liveStyles.spin} size={22} />
            </div>
          ) : data ? (
            <>
              <div className={styles.actionRow}>
                {active && (
                  <button className={`${styles.actionButton} ${styles.actionPrimary}`} disabled={busy} onClick={() => void complete()}>
                    <CheckCircle2 size={14} /> Realizada
                  </button>
                )}
                {(active || status === "SUSPENDED") && (
                  <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "reschedule" })}>
                    <CalendarClock size={14} /> Reprogramar
                  </button>
                )}
                {active && (
                  <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "reason", status: "SUSPENDED" })}>
                    <PauseCircle size={14} /> Suspender
                  </button>
                )}
                {status === "SUSPENDED" && (
                  <button className={styles.actionButton} disabled={busy} onClick={() => void changeStatus("SCHEDULED", "Se dicta normalmente")}>
                    <RotateCcw size={14} /> Restaurar
                  </button>
                )}
                {(active || status === "SUSPENDED") && (
                  <button className={`${styles.actionButton} ${styles.actionDanger}`} disabled={busy} onClick={() => setModal({ kind: "reason", status: "CANCELLED" })}>
                    <Ban size={14} /> Cancelar
                  </button>
                )}
                {status === "COMPLETED" && (
                  <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "reopen" })}>
                    <RotateCcw size={14} /> Reabrir
                  </button>
                )}
                {(active || status === "SUSPENDED") && (
                  <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "edit" })}>
                    <Pencil size={14} /> Solo esta clase
                  </button>
                )}
                <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "notice" })}>
                  <Megaphone size={14} /> Avisar
                </button>
                <Link className={styles.actionButton} href={"/admin/sessions/" + sessionId}>
                  <ExternalLink size={14} /> Ver completa
                </Link>
                <Link className={styles.actionButton} href={"/admin/classes/" + data.class.id}>
                  <Pencil size={14} /> Gestionar clase
                </Link>
              </div>

              <div className={styles.infoGrid}>
                <div>
                  <span>Profesores</span>
                  <strong>{professorsShown.map((item) => item.displayName).join(", ") || "—"}</strong>
                </div>
                <div>
                  <span>Cupo</span>
                  <strong>
                    {data.participants.length} / {data.class.capacity}
                  </strong>
                </div>
                {data.rescheduledFrom && (
                  <div>
                    <span>Fecha original</span>
                    <strong>
                      {formatDateOnly(data.rescheduledFrom.date)} {data.rescheduledFrom.startTime}
                    </strong>
                  </div>
                )}
                {data.rescheduledTo && (
                  <div>
                    <span>Nueva fecha</span>
                    <strong>
                      {formatDateOnly(data.rescheduledTo.date)} {data.rescheduledTo.startTime}
                    </strong>
                  </div>
                )}
              </div>

              <section className={styles.section}>
                <div className={styles.actionRow} style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Alumnos</h3>
                  {active && (
                    <button className={styles.actionButton} disabled={busy} onClick={() => setModal({ kind: "participant" })}>
                      <UserPlus size={14} /> Agregar
                    </button>
                  )}
                </div>
                {data.participants.length === 0 && <p className={styles.emptyDay}>Todavía no hay alumnos en esta clase.</p>}
                {data.participants.map((participant) => (
                  <div className={styles.participant} key={participant.studentId}>
                    <div>
                      <strong>
                        {participant.student.firstName} {participant.student.lastName}
                      </strong>
                      <div className={styles.badges}>
                        {participant.participantType !== "ENROLLMENT" && (
                          <span className={styles.badge}>{PARTICIPANT_LABEL[participant.participantType]}</span>
                        )}
                        <span className={`${styles.badge} ${coverageBadge(participant.payment.status)}`}>
                          {participant.payment.paymentType === "MONTHLY" ? "Mensual · " : participant.billingType === "PER_CLASS" ? "Clase · " : ""}
                          {COVERAGE_LABEL[participant.payment.status]}
                          {participant.payment.status === "PARTIAL" ? " · debe " + formatMoney(participant.payment.balanceAmount) : ""}
                        </span>
                      </div>
                    </div>
                    <div className={styles.participantActions}>
                      {status !== "CANCELLED" && status !== "SUSPENDED" && status !== "RESCHEDULED" && (
                        <>
                          <button
                            className={styles.toggle}
                            aria-pressed={participant.attendanceStatus === "PRESENT"}
                            disabled={busy}
                            onClick={() => void attendance(participant, "PRESENT")}
                          >
                            Presente
                          </button>
                          <button
                            className={`${styles.toggle} ${styles.toggleAbsent}`}
                            aria-pressed={participant.attendanceStatus === "ABSENT"}
                            disabled={busy}
                            onClick={() => void attendance(participant, "ABSENT")}
                          >
                            Ausente
                          </button>
                        </>
                      )}
                      {participant.billingType !== "FREE" &&
                        ["NONE", "PENDING", "OVERDUE", "PARTIAL"].includes(participant.payment.status) &&
                        status !== "CANCELLED" &&
                        status !== "SUSPENDED" &&
                        status !== "RESCHEDULED" && (
                          <button className={styles.toggle} disabled={busy} onClick={() => setModal({ kind: "collect", participant, key: newIdempotencyKey() })}>
                            <CircleDollarSign size={12} /> Cobrar
                          </button>
                        )}
                    </div>
                  </div>
                ))}
              </section>

              {data.statusHistory.length > 0 && (
                <section className={styles.section}>
                  <h3>Historial</h3>
                  <ul className={styles.history}>
                    {[...data.statusHistory].reverse().map((item, index) => (
                      <li key={index}>
                        <strong>{SESSION_STATUS_LABEL[item.to]}</strong> · {new Date(item.at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
                        {item.reason ? " · " + item.reason : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : null}
        </div>
      </aside>

      <LiveModal
        open={modal?.kind === "reason"}
        title={modal?.kind === "reason" && modal.status === "CANCELLED" ? "Cancelar la clase" : "Suspender la clase"}
        description={
          modal?.kind === "reason" && modal.status === "CANCELLED"
            ? "La clase no se dicta y no se reprograma. Los pagos y la asistencia registrados se conservan."
            : "La clase queda en espera: después podés reprogramarla o cancelarla definitivamente."
        }
        submitting={busy}
        submitLabel="Confirmar"
        onClose={() => setModal(null)}
        onSubmit={submitReason}
      >
        <Field label="Motivo" wide>
          <input name="reason" required minLength={3} maxLength={500} placeholder="Ej.: corte de luz, profesor enfermo" />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "reschedule"}
        title="Reprogramar"
        description="Se crea la clase en la nueva fecha con los mismos alumnos. Los pagos de la clase original la cubren: no se vuelve a cobrar."
        submitting={busy}
        submitLabel="Reprogramar"
        onClose={() => setModal(null)}
        onSubmit={submitReschedule}
      >
        <Field label="Nueva fecha">
          <input name="date" type="date" min={todayInArgentina()} required />
        </Field>
        <Field label="Pista">
          <select name="spaceId" defaultValue={data?.spaceId ?? ""}>
            <option value="">Sin pista</option>
            {spaces.filter((item) => item.status === "ACTIVE").map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Desde">
          <input name="startTime" type="time" defaultValue={data?.startTime} required />
        </Field>
        <Field label="Hasta">
          <input name="endTime" type="time" defaultValue={data?.endTime} required />
        </Field>
        <Field label="Motivo" wide>
          <input name="reason" required minLength={3} maxLength={500} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "edit"}
        title="Cambiar solo esta clase"
        description="El cambio aplica únicamente a esta fecha. Para cambiar las siguientes usá los horarios de la clase."
        submitting={busy}
        onClose={() => setModal(null)}
        onSubmit={submitEdit}
      >
        <Field label="Desde">
          <input name="startTime" type="time" defaultValue={data?.startTime} required />
        </Field>
        <Field label="Hasta">
          <input name="endTime" type="time" defaultValue={data?.endTime} required />
        </Field>
        <Field label="Pista">
          <select name="spaceId" defaultValue={data?.spaceId ?? ""}>
            <option value="">Sin pista</option>
            {spaces.filter((item) => item.status === "ACTIVE").map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Profesores (vacío: los de la clase)">
          <select name="professorIds" multiple defaultValue={data?.professors?.map((item) => item.id) ?? []}>
            {professors.map((item) => (
              <option key={item._id} value={item._id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notas" wide>
          <textarea name="notes" defaultValue={data?.notes ?? ""} maxLength={1000} />
        </Field>
        <Field label="Motivo (opcional)" wide>
          <input name="reason" maxLength={500} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "reopen"}
        title="Reabrir la clase"
        description="Vuelve a quedar programada para corregir asistencia o estado. Queda registrado quién y por qué."
        submitting={busy}
        submitLabel="Reabrir"
        onClose={() => setModal(null)}
        onSubmit={submitReopen}
      >
        <Field label="Motivo" wide>
          <input name="reason" required minLength={3} maxLength={500} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "participant"}
        title="Agregar alumno a esta clase"
        description="Solo para esta fecha. Se respeta el cupo."
        submitting={busy}
        submitLabel="Agregar"
        onClose={() => {
          setModal(null);
          setSelectedStudent("");
          setStudentQuery("");
        }}
        onSubmit={submitParticipant}
      >
        <Field label="Buscar alumno" wide>
          <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Nombre, email o teléfono" />
        </Field>
        <div className={`${liveStyles.fieldWide} ${styles.searchResults}`}>
          {studentResults.map((item) => (
            <button type="button" key={item._id} aria-pressed={selectedStudent === item._id} onClick={() => setSelectedStudent(item._id)}>
              {item.firstName} {item.lastName}
            </button>
          ))}
        </div>
        <Field label="Tipo">
          <select name="participantType" defaultValue="AUTHORIZED">
            <option value="AUTHORIZED">Autorizado (clase suelta, invitado)</option>
            <option value="MAKEUP">Recupera una clase</option>
          </select>
        </Field>
        <Field label="Nota">
          <input name="note" maxLength={300} />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "notice"}
        title="Avisar a alumnos y profesores"
        description="Se preparan los emails en Comunicaciones para revisarlos y enviarlos."
        submitting={busy}
        submitLabel="Preparar avisos"
        onClose={() => setModal(null)}
        onSubmit={submitNotice}
      >
        <Field label="Mensaje" wide>
          <textarea
            name="message"
            required
            minLength={5}
            maxLength={2000}
            defaultValue={data ? `La clase de ${data.class.name} del ${formatDateOnly(data.sessionDate)} a las ${data.startTime} ${data.status === "CANCELLED" ? "se canceló" : data.status === "SUSPENDED" ? "se suspendió" : "tuvo cambios"}.` : ""}
          />
        </Field>
      </LiveModal>

      <LiveModal
        open={modal?.kind === "collect"}
        title="Registrar cobro"
        description={
          modal?.kind === "collect"
            ? `${modal.participant.student.firstName} ${modal.participant.student.lastName} · ${
                modal.participant.payment.paymentType === "MONTHLY" || modal.participant.billingType === "MONTHLY" ? "mensualidad del mes" : "clase del día"
              }. La fecha de cobro es hoy salvo que indiques otra.`
            : ""
        }
        submitting={busy}
        submitLabel="Cobrar"
        onClose={() => setModal(null)}
        onSubmit={submitCollect}
      >
        <Field label="Medio de pago">
          <select name="method" defaultValue="CASH">
            {(Object.keys(METHOD_LABEL) as CollectionMethod[]).map((item) => (
              <option key={item} value={item}>
                {METHOD_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Importe (vacío: saldo completo)">
          <input
            name="amount"
            type="number"
            min="0"
            step="0.01"
            placeholder={modal?.kind === "collect" ? String(modal.participant.payment.balanceAmount || modal.participant.payment.amount) : ""}
          />
        </Field>
        <Field label="Fecha de cobro">
          <input name="receivedAt" type="date" defaultValue={todayInArgentina()} max={todayInArgentina()} />
        </Field>
      </LiveModal>
    </>
  );
}
