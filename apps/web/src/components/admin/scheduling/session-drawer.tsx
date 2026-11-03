"use client";

import { collectedToast, ProofField, proofFileOf, tryUploadProof } from "../billing/proof";
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
import type { MidMonthPolicy } from "@mym/shared";
import { apiFetch, apiMessage } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { Field, LiveModal } from "../live/live-common";
import {
  availableMonthlyPlans,
  dayLabels,
  defaultMonthlyPlan,
  monthlyPlansAvailable,
  monthlyPlansLabel,
  monthlyPriceFor,
  normalizedMode,
  preferenceForClass,
  preferenceLabel
} from "../live/class-detail-helpers";
import type { BillingPreference, DanceClass } from "../live/live-types";
import enrollStyles from "../live/class-detail-enroll.module.css";
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
  | { kind: "enrollment" }
  | { kind: "notice" }
  | { kind: "collect"; participant: SessionParticipant; key: string }
  | null;

type ProfessorOption = { _id: string; displayName: string };
type StudentOption = { _id: string; firstName: string; lastName: string; email?: string; phone?: string; dni?: string };

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
  const [studentLookup, setStudentLookup] = useState<{ query: string; items: StudentOption[]; error?: string } | null>(null);
  const [searchRevision, setSearchRevision] = useState(0);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [enrollmentClass, setEnrollmentClass] = useState<DanceClass | null>(null);
  const [enrollmentError, setEnrollmentError] = useState("");
  const [enrolledStudentIds, setEnrolledStudentIds] = useState<string[]>([]);
  const [billingPreference, setBillingPreference] = useState<BillingPreference>("PER_CLASS");
  const [monthlyPlan, setMonthlyPlan] = useState<4 | 8>(4);
  const [startDate, setStartDate] = useState(todayInArgentina());
  const [joinPolicy, setJoinPolicy] = useState<"" | MidMonthPolicy>("");
  const [joinCustomAmount, setJoinCustomAmount] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);

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
    if (modal?.kind !== "enrollment" || !data) return;
    const controller = new AbortController();
    void Promise.all([
      apiFetch<DanceClass>("/admin/classes/" + data.class.id, { signal: controller.signal }),
      apiFetch<{ items: Array<{ studentId: { _id: string } }> }>("/admin/enrollments?classId=" + data.class.id, { signal: controller.signal })
    ]).then(([danceClass, enrollments]) => {
      if (controller.signal.aborted) return;
      setEnrollmentClass(danceClass);
      setEnrolledStudentIds(enrollments.items.map((item) => item.studentId._id));
      setBillingPreference(preferenceForClass(danceClass) ?? "PER_CLASS");
      setMonthlyPlan(defaultMonthlyPlan(danceClass));
      setSelectedSeries(data.seriesId && danceClass.scheduleOccupancy?.some((slot) => slot.seriesId === data.seriesId) ? [data.seriesId] : []);
    }).catch((error) => { if (!controller.signal.aborted) setEnrollmentError(apiMessage(error)); });
    return () => controller.abort();
  }, [modal?.kind, data?.class.id, data?.seriesId]);

  useEffect(() => {
    const query = studentQuery.trim();
    if ((modal?.kind !== "participant" && modal?.kind !== "enrollment") || query.length < 2 || (modal.kind === "enrollment" && !enrollmentClass)) return;
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      void apiFetch<{ items: StudentOption[] }>(
        "/admin/students?isActive=true&limit=20&q=" + encodeURIComponent(query) + (modal.kind === "enrollment" ? "&branchId=" + enrollmentClass!.branchId : ""), { signal: controller.signal }
      ).then((result) => {
        if (!controller.signal.aborted) setStudentLookup({ query, items: result.items });
      }).catch(() => {
        if (!controller.signal.aborted) setStudentLookup({ query, items: [], error: "No pudimos buscar alumnos. Intentá nuevamente." });
      });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(handle); };
  }, [modal?.kind, studentQuery, searchRevision, enrollmentClass]);

  function openParticipant() {
    setStudentQuery("");
    setStudentLookup(null);
    setSelectedStudent(null);
    setModal({ kind: "participant" });
  }

  function openEnrollment() {
    if (!data) return;
    setStudentQuery("");
    setStudentLookup(null);
    setSelectedStudent(null);
    setEnrollmentClass(null);
    setEnrollmentError("");
    setEnrolledStudentIds([]);
    setStartDate(data.sessionDate >= todayInArgentina() ? data.sessionDate : todayInArgentina());
    setJoinPolicy("");
    setJoinCustomAmount("");
    setSelectedSeries([]);
    setModal({ kind: "enrollment" });
  }

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
          body: JSON.stringify({ studentId: selectedStudent._id, participantType: form.get("participantType"), note: form.get("note") || undefined })
        }),
      "Alumno agregado a esta clase"
    );
  }

  async function submitEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent || !enrollmentClass || !data) return;
    const mode = normalizedMode(enrollmentClass);
    const effectivePreference = mode === "BOTH" ? billingPreference : preferenceForClass(enrollmentClass);
    const midMonth = effectivePreference === "MONTHLY" && startDate.slice(8, 10) !== "01";
    if (midMonth && !joinPolicy) {
      setEnrollmentError("Elegí cómo cobrar el primer mes.");
      return;
    }
    if (midMonth && joinPolicy === "CUSTOM" && (joinCustomAmount.trim() === "" || !Number.isFinite(Number(joinCustomAmount)))) {
      setEnrollmentError("Indicá el importe personalizado del primer mes.");
      return;
    }
    setBusy(true);
    setEnrollmentError("");
    try {
      const created = await apiFetch<{ firstMonth?: { needsDecision: boolean } }>("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({
          classId: data.class.id,
          studentId: selectedStudent._id,
          billingPreference: mode === "FREE" ? undefined : effectivePreference,
          monthlyPlan: effectivePreference === "MONTHLY" ? monthlyPlan : undefined,
          startDate,
          seriesIds: selectedSeries.length ? selectedSeries : undefined,
          joinPolicy: midMonth ? joinPolicy : undefined,
          joinCustomAmount: midMonth && joinPolicy === "CUSTOM" ? Number(joinCustomAmount) : undefined
        })
      });
      setModal(null);
      toast(created.firstMonth?.needsDecision
        ? { title: "Alumno inscripto", description: "Falta definir el cobro del primer mes desde su cuenta.", tone: "warning" }
        : { title: "Alumno inscripto", description: "Modalidad: " + preferenceLabel(effectivePreference) + ".", tone: "success" });
      await load();
      onChanged();
    } catch (error) {
      setEnrollmentError(apiMessage(error));
    } finally {
      setBusy(false);
    }
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
    const proof = proofFileOf(form);
    void run(async () => {
      const result = await apiFetch<{ collection: { id: string } }>("/admin/billing/sessions/" + sessionId + "/collect", {
        method: "POST",
        body: JSON.stringify({
          studentId: modal.participant.studentId,
          method: form.get("method") as CollectionMethod,
          amount: amount > 0 ? amount : undefined,
          receivedAt: form.get("receivedAt") || undefined,
          idempotencyKey: modal.key
        })
      });
      const proofError = await tryUploadProof(result.collection.id, proof);
      if (proofError) toast(collectedToast(proofError));
    }, "Cobro registrado");
  }

  const status = data?.status;
  const active = status === "SCHEDULED" || status === "IN_PROGRESS";
  const professorsShown = data?.professors?.length ? data.professors : data?.class.professors ?? [];
  const spaceName = data?.spaceId ? spaces.find((item) => item._id === data.spaceId)?.name ?? "Pista" : "Sin pista";
  const priceOptions = data
    ? [
        ...(["PER_CLASS", "BOTH"].includes(data.class.billingMode) && data.class.pricePerClass > 0
          ? [{ label: "Por clase", price: data.class.pricePerClass }]
          : []),
        ...(["MONTHLY", "BOTH"].includes(data.class.billingMode) && data.class.monthlyPrice4 && data.class.monthlyPrice4 > 0
          ? [{ label: "4 clases", price: data.class.monthlyPrice4 }]
          : []),
        ...(["MONTHLY", "BOTH"].includes(data.class.billingMode) && data.class.monthlyPrice8 && data.class.monthlyPrice8 > 0
          ? [{ label: "8 clases", price: data.class.monthlyPrice8 }]
          : [])
      ]
    : [];
  const studentSearchFields = <>
    <Field label="Buscar alumno" wide>
      <input value={studentQuery} disabled={modal?.kind === "enrollment" && !enrollmentClass} onChange={(event) => { setStudentQuery(event.target.value); setSelectedStudent(null); setStudentLookup(null); }} placeholder="Nombre, email, teléfono o DNI" autoComplete="off" />
    </Field>
    <div className={`${liveStyles.fieldWide} ${styles.searchResults}`} aria-live="polite">
      {selectedStudent ? <div className={styles.selectedStudent}>
        <span><CheckCircle2 size={18} aria-hidden="true" /><strong>{selectedStudent.firstName} {selectedStudent.lastName}</strong> seleccionado</span>
        <button type="button" onClick={() => setSelectedStudent(null)}>Cambiar</button>
      </div> : studentQuery.trim().length < 2 ? <p>Escribí al menos 2 caracteres para buscar.</p>
        : studentLookup?.query !== studentQuery.trim() ? <p role="status">Buscando alumnos…</p>
          : studentLookup.error ? <p role="alert">{studentLookup.error} <button type="button" onClick={() => { setStudentLookup(null); setSearchRevision((value) => value + 1); }}>Reintentar</button></p>
            : studentLookup.items.length === 0 ? <p>No encontramos alumnos activos con esos datos.</p>
              : studentLookup.items.map((item) => {
                const alreadyEnrolled = modal?.kind === "enrollment" && enrolledStudentIds.includes(item._id);
                return <button type="button" key={item._id} disabled={alreadyEnrolled} onClick={() => setSelectedStudent(item)}>
                  <strong>{item.firstName} {item.lastName}</strong>
                  <small>{alreadyEnrolled ? "Ya inscripto en esta clase" : [item.email, item.phone, item.dni && `DNI ${item.dni}`].filter(Boolean).join(" · ")}</small>
                </button>;
              })}
    </div>
  </>;
  const enrollmentMode = enrollmentClass ? normalizedMode(enrollmentClass) : "FREE";
  const enrollmentPreference = enrollmentClass ? (enrollmentMode === "BOTH" ? billingPreference : preferenceForClass(enrollmentClass)) : undefined;
  const enrollmentMidMonth = enrollmentPreference === "MONTHLY" && startDate.slice(8, 10) !== "01";
  const enrollmentSlots = enrollmentClass?.scheduleOccupancy ?? [];

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

              {priceOptions.length > 0 && (
                <section className={styles.monthlyPricing} aria-labelledby="prices-title">
                  <h3 id="prices-title">Precios</h3>
                  <div className={styles.monthlyPricingGrid}>
                    {priceOptions.map((option) => (
                      <div key={option.label}>
                        <span>{option.label}</span>
                        <strong>{formatMoney(option.price)}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className={styles.section}>
                <div className={styles.actionRow} style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <h3>Alumnos</h3>
                  {active && (
                    <div className={styles.actionRow}>
                      <button className={styles.actionButton} disabled={busy} onClick={openEnrollment}>
                        <UserPlus size={14} /> Inscribir
                      </button>
                      <button className={styles.actionButton} disabled={busy} onClick={openParticipant}>
                        <UserPlus size={14} /> Agregar solo a esta fecha
                      </button>
                    </div>
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
        submitDisabled={!selectedStudent}
        submitLabel="Agregar"
        onClose={() => {
          setModal(null);
          setSelectedStudent(null);
          setStudentQuery("");
          setStudentLookup(null);
        }}
        onSubmit={submitParticipant}
      >
        {studentSearchFields}
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
        open={modal?.kind === "enrollment"}
        title="Inscribir alumno a la clase"
        description={data ? `${data.class.name} · ${formatDateOnly(data.sessionDate)}. La inscripción aplica al grupo y a los horarios elegidos.` : ""}
        submitting={busy}
        submitDisabled={!selectedStudent || !enrollmentClass || !["ACTIVE", "PAUSED"].includes(enrollmentClass.status)}
        submitLabel="Inscribir alumno"
        error={enrollmentError}
        onClose={() => setModal(null)}
        onSubmit={(event) => void submitEnrollment(event)}
      >
        {!enrollmentClass ? !enrollmentError && <p className={liveStyles.fieldWide} role="status">Cargando opciones de inscripción…</p> : <>
          {studentSearchFields}
          {enrollmentMode === "BOTH" ? <Field label="Cómo paga">
            <select value={billingPreference} onChange={(event) => setBillingPreference(event.target.value as BillingPreference)}>
              <option value="PER_CLASS">Por clase · {formatMoney(enrollmentClass.pricePerClass ?? 0)}</option>
              <option value="MONTHLY">Mensual · {monthlyPlansLabel(enrollmentClass)}</option>
            </select>
          </Field> : <p className={liveStyles.fieldWide}>Modalidad: {preferenceLabel(enrollmentPreference)}.</p>}
          {enrollmentPreference === "MONTHLY" && monthlyPlansAvailable(enrollmentClass) && <Field label="Plan mensual">
            <select value={monthlyPlan} onChange={(event) => setMonthlyPlan(Number(event.target.value) as 4 | 8)}>
              {availableMonthlyPlans(enrollmentClass).map((plan) => <option key={plan} value={plan}>Plan de {plan} clases · {formatMoney(monthlyPriceFor(enrollmentClass, plan))}</option>)}
            </select>
          </Field>}
          {enrollmentSlots.length > 1 && <div className={liveStyles.fieldWide}>
            <strong>Días y horarios</strong>
            <div className={enrollStyles.slotChips}>
              {enrollmentSlots.map((slot) => {
                const checked = selectedSeries.includes(slot.seriesId);
                const full = slot.occupied >= enrollmentClass.capacity;
                return <label key={slot.seriesId} className={enrollStyles.slotChip + (checked ? " " + enrollStyles.slotChipOn : "")}>
                  <input type="checkbox" checked={checked} onChange={(event) => setSelectedSeries((current) => event.target.checked ? [...current, slot.seriesId] : current.filter((id) => id !== slot.seriesId))} />
                  <strong>{dayLabels[slot.day] ?? slot.day} {slot.startTime}</strong>
                  <small className={full ? enrollStyles.slotFull : undefined}>{slot.occupied}/{enrollmentClass.capacity} cupos{full ? " · lleno" : ""}</small>
                </label>;
              })}
            </div>
            <small>{selectedSeries.length === 0 ? "Sin selección: se inscribe en todos los horarios." : `${selectedSeries.length} de ${enrollmentSlots.length} horarios seleccionados.`}</small>
          </div>}
          <Field label="Fecha de inicio">
            <input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
          {enrollmentMidMonth && <Field label="Cobro del primer mes">
            <select value={joinPolicy} required onChange={(event) => setJoinPolicy(event.target.value as "" | MidMonthPolicy)}>
              <option value="">Elegí cómo cobrar el primer mes</option>
              <option value="FULL">Cuota completa del mes</option>
              <option value="PRORATED">Proporcional a las clases que quedan</option>
              <option value="CUSTOM">Importe personalizado</option>
            </select>
          </Field>}
          {enrollmentMidMonth && joinPolicy === "CUSTOM" && <Field label="Importe a cobrar ($)">
            <input type="number" min="0" step="0.01" required value={joinCustomAmount} onChange={(event) => setJoinCustomAmount(event.target.value)} />
          </Field>}
        </>}
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
        <ProofField />
      </LiveModal>
    </>
  );
}
