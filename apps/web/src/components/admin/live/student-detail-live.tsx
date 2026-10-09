"use client";

import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileText,
  Mail,
  MessageCircle,
  Plus,
  Power,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage, apiUrl } from "@/lib/api";
import { formatDateOnly, todayInArgentina } from "@/lib/dates";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type {
  BillingPreference,
  Branch,
  DanceClass,
  Payment,
  Student
} from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock } from "./live-common";
import styles from "./student-detail.module.css";

type Enrollment = {
  _id: string;
  status: "ACTIVE" | "INACTIVE";
  enrolledAt: string;
  endedAt?: string;
  billingPreference?: BillingPreference;
  scheduleKeys?: string[];
  classId: DanceClass;
};

type StudentDetail = {
  student: Student;
  enrollments: Enrollment[];
  payments: Payment[];
  financial: {
    paidAmount: number;
    paidCount: number;
    pendingAmount: number;
    pendingCount: number;
    overdueAmount: number;
    overdueCount: number;
  };
};

function paymentStatus(payment: Payment) {
  if (payment.status === "PENDING" && new Date(payment.dueDate).getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
}

function whatsappHref(phone?: string, name?: string) {
  if (!phone) return "";
  const normalized = phone.replace(/\D/g, "");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(
    `Hola ${name ?? ""}, te escribimos desde M&M Academia de Baile.`
  )}`;
}

function classBillingMode(danceClass?: DanceClass) {
  return danceClass?.billingMode ?? "MONTHLY";
}

function defaultBillingPreference(danceClass?: DanceClass): BillingPreference {
  const mode = classBillingMode(danceClass);
  return mode === "MONTHLY" ? "MONTHLY" : "PER_CLASS";
}

function billingPreferenceLabel(
  danceClass: DanceClass,
  preference?: BillingPreference
) {
  const mode = classBillingMode(danceClass);

  if (mode === "FREE") return "Sin cargo";
  if (mode === "PER_CLASS") return "Por clase";
  if (mode === "MONTHLY") return "Mensual";
  return preference === "MONTHLY" ? "Mensual" : "Por clase";
}

function monthlyPlansAvailable(danceClass?: DanceClass) {
  return danceClass?.monthlyPrice4 !== undefined || danceClass?.monthlyPrice8 !== undefined;
}

function monthlyPriceFor(danceClass: DanceClass, plan: 4 | 8) {
  return plan === 8
    ? danceClass.monthlyPrice8 ?? danceClass.monthlyPrice ?? 0
    : danceClass.monthlyPrice4 ?? danceClass.monthlyPrice ?? 0;
}

function paymentReference(payment: Payment) {
  if ((payment.paymentType ?? "MONTHLY") === "PER_CLASS" && payment.classDate) {
    return formatDateOnly(payment.classDate);
  }
  return payment.period;
}

const dayLabels: Record<string, string> = {
  MONDAY: "Lunes", TUESDAY: "Martes", WEDNESDAY: "Miércoles", THURSDAY: "Jueves",
  FRIDAY: "Viernes", SATURDAY: "Sábado", SUNDAY: "Domingo"
};

function scheduleKey(schedule: { day: string; startTime: string; endTime: string }) {
  return `${schedule.day}:${schedule.startTime}:${schedule.endTime}`;
}

function scheduleLabel(schedule: { day: string; startTime: string; endTime: string }) {
  return `${dayLabels[schedule.day] ?? schedule.day} · ${schedule.startTime}–${schedule.endTime}`;
}

export function StudentDetailLive({ id }: { id: string }) {
  const { toast, confirm } = useAdminFeedback();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [editing, setEditing] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [paying, setPaying] = useState<Payment | null>(null);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedBillingPreference, setSelectedBillingPreference] =
    useState<BillingPreference>("PER_CLASS");
  const [selectedMonthlyPlan, setSelectedMonthlyPlan] = useState<4 | 8>(4);
  const [selectedScheduleKeys, setSelectedScheduleKeys] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [detail, branchList, classList] = await Promise.all([
        apiFetch<StudentDetail>(`/admin/students/${id}`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<DanceClass[]>("/admin/classes")
      ]);
      setData(detail);
      setBranches(branchList);
      setClasses(classList);
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeEnrollments = useMemo(
    () => data?.enrollments.filter((enrollment) => enrollment.status === "ACTIVE") ?? [],
    [data]
  );

  const availableClasses = useMemo(() => {
    if (!data) return [];
    const activeClassIds = new Set(activeEnrollments.map((enrollment) => enrollment.classId._id));

    return classes.filter(
      (danceClass) =>
        danceClass.status === "ACTIVE" &&
        danceClass.branchId === data.student.branchId &&
        !activeClassIds.has(danceClass._id)
    );
  }, [classes, data, activeEnrollments]);

  const selectedClass = useMemo(
    () => availableClasses.find((danceClass) => danceClass._id === selectedClassId),
    [availableClasses, selectedClassId]
  );

  function openEnrollmentModal() {
    setSelectedClassId("");
    setSelectedBillingPreference("PER_CLASS");
    setSelectedMonthlyPlan(4);
    setSelectedScheduleKeys([]);
    setEnrollModal(true);
  }

  function selectEnrollmentClass(classId: string) {
    const danceClass = availableClasses.find((item) => item._id === classId);
    setSelectedClassId(classId);
    setSelectedBillingPreference(defaultBillingPreference(danceClass));
    setSelectedMonthlyPlan(4);
    setSelectedScheduleKeys(danceClass?.schedules[0] ? [scheduleKey(danceClass.schedules[0])] : []);
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      await apiFetch<Student>(`/admin/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          birthDate: form.get("birthDate") || undefined,
          guardianName: form.get("guardianName"),
          guardianPhone: form.get("guardianPhone"),
          notes: form.get("notes")
        })
      });
      setEditing(false);
      toast("Datos del alumno actualizados");
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo actualizar el alumno", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    if (!data) return;

    const approved = await confirm({
      title: data.student.isActive ? "Inactivar alumno" : "Reactivar alumno",
      description: data.student.isActive
        ? "El alumno dejará de aparecer como activo para nuevas operaciones. Su historial se conserva."
        : "El alumno volverá a estar disponible para inscripciones y operaciones.",
      confirmLabel: data.student.isActive ? "Inactivar" : "Reactivar",
      tone: data.student.isActive ? "danger" : "default"
    });
    if (!approved) return;

    setBusy(true);
    setError("");

    try {
      await apiFetch<Student>(`/admin/students/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !data.student.isActive })
      });
      toast(data.student.isActive ? "Alumno inactivado" : "Alumno reactivado");
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo cambiar el estado", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClassId || !selectedClass) return;

    setBusy(true);
    setError("");

    try {
      await apiFetch("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({
          classId: selectedClassId,
          studentId: id,
          billingPreference:
            classBillingMode(selectedClass) === "FREE"
              ? undefined
              : selectedBillingPreference,
          monthlyPlan: selectedBillingPreference === "MONTHLY" ? selectedMonthlyPlan : undefined,
          scheduleKeys: selectedScheduleKeys
        })
      });
      setSelectedClassId("");
      setSelectedScheduleKeys([]);
      setEnrollModal(false);
      toast({
        title: "Alumno inscripto",
        description:
          selectedClass.name + " · " +
          billingPreferenceLabel(selectedClass, selectedBillingPreference)
      });
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo inscribir", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function removeEnrollment(enrollment: Enrollment) {
    const approved = await confirm({
      title: "Dar de baja la inscripción",
      description:
        "Se dará de baja a " +
        data!.student.firstName +
        " de " +
        enrollment.classId.name +
        ". Los pagos y el historial se conservan.",
      confirmLabel: "Dar de baja",
      tone: "danger"
    });
    if (!approved) return;

    setBusy(true);
    setError("");

    try {
      await apiFetch<void>(`/admin/enrollments/${enrollment._id}`, { method: "DELETE" });
      toast("Inscripción dada de baja");
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo dar de baja", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paying) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paying._id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: form.get("paymentMethod"),
          paidAt: form.get("paidAt") || undefined
        })
      });
      setPaying(null);
      toast("Pago registrado y recibo generado");
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo registrar el pago", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remind(paymentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/remind`, { method: "POST" });
      toast("Recordatorio enviado por email");
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo enviar el recordatorio", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function emailReceipt(paymentId: string) {
    setBusy(true);
    setError("");

    try {
      await apiFetch(`/admin/payments/${paymentId}/receipt/email`, { method: "POST" });
      toast("Recibo enviado por email");
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo enviar el recibo", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function downloadReceipt(payment: Payment) {
    const link = document.createElement("a");
    link.href = apiUrl(`/admin/payments/${payment._id}/receipt.pdf?download=1`);
    link.download = `${payment.receiptNumber ?? "recibo"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function shareReceiptWhatsApp(payment: Payment) {
    if (!data?.student.phone) return;

    const phone = data.student.phone.replace(/\D/g, "");
    const text = `Hola ${data.student.firstName}, te compartimos el recibo ${payment.receiptNumber ?? "de pago"} por $ ${payment.amount.toLocaleString("es-AR")} correspondiente a ${payment.concept}.`;
    const chat = window.open(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`,
      "_blank"
    );
    if (chat) chat.opener = null;

    downloadReceipt(payment);
    toast({
      title: chat ? "WhatsApp Web abierto" : "Recibo descargado",
      description: chat
        ? "El PDF se descargó para que lo adjuntes en el chat abierto."
        : "Permití las ventanas emergentes para abrir WhatsApp Web y adjuntá este PDF al chat."
    });
  }

  if (!data) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const { student, financial } = data;
  const fullName = `${student.firstName} ${student.lastName}`;

  return (
    <>
      <Link href="/admin/students" className={styles.back}>
        <ArrowLeft size={15} /> Volver a alumnos
      </Link>

      <PageHeader
        eyebrow="FICHA DE ALUMNO"
        title={fullName}
        description="Datos personales, clases, modalidad de cobro, contacto y estado de cuenta."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <section className={styles.hero}>
        <span className={styles.avatar}>{student.firstName[0]}{student.lastName[0]}</span>
        <div className={styles.heroText}>
          <span className={student.isActive ? styles.active : styles.inactive}>
            {student.isActive ? "Alumno activo" : "Alumno inactivo"}
          </span>
          <h2>{fullName}</h2>
          <p>{student.phone || student.email || "Sin contacto cargado"}</p>
        </div>
        <div className={styles.heroActions}>
          {student.email && (
            <a href={`mailto:${student.email}`}><Mail size={16} /> Email</a>
          )}
          {student.phone && (
            <a href={whatsappHref(student.phone, student.firstName)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          <button onClick={() => setEditing(true)}>Editar</button>
          <button className={styles.dangerAction} disabled={busy} onClick={() => void toggleActive()}>
            <Power size={16} /> {student.isActive ? "Inactivar" : "Reactivar"}
          </button>
        </div>
      </section>

      <div className={styles.financialGrid}>
        <article><span>Cobrado</span><strong>$ {financial.paidAmount.toLocaleString("es-AR")}</strong><small>{financial.paidCount} pagos</small></article>
        <article><span>Pendiente</span><strong>$ {financial.pendingAmount.toLocaleString("es-AR")}</strong><small>{financial.pendingCount} pagos</small></article>
        <article data-tone="danger"><span>Vencido</span><strong>$ {financial.overdueAmount.toLocaleString("es-AR")}</strong><small>{financial.overdueCount} pagos</small></article>
        <article><span>Clases activas</span><strong>{activeEnrollments.length}</strong><small>inscripciones actuales</small></article>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span>DATOS</span><h3>Información personal</h3></div>
          </div>
          <dl className={styles.detailList}>
            <div><dt>Sede</dt><dd>{branches.find((branch) => branch._id === student.branchId)?.name ?? "—"}</dd></div>
            <div><dt>Email</dt><dd>{student.email || "—"}</dd></div>
            <div><dt>Teléfono</dt><dd>{student.phone || "—"}</dd></div>
            <div><dt>Nacimiento</dt><dd>{formatDateOnly(student.birthDate)}</dd></div>
            <div><dt>Responsable</dt><dd>{student.guardianName || "—"}</dd></div>
            <div><dt>Tel. responsable</dt><dd>{student.guardianPhone || "—"}</dd></div>
            <div className={styles.notes}><dt>Notas</dt><dd>{student.notes || "Sin notas"}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span>CLASES</span><h3>Inscripciones</h3></div>
            <button onClick={openEnrollmentModal}><Plus size={15} /> Inscribir</button>
          </div>

          <div className={styles.itemList}>
            {activeEnrollments.length === 0 && <p className={styles.empty}>No tiene clases activas.</p>}
            {activeEnrollments.map((enrollment) => (
              <div key={enrollment._id}>
                <span className={styles.itemIcon}><CalendarDays size={17} /></span>
                <span>
                  <strong>{enrollment.classId.name}</strong>
                  <small>
                    {billingPreferenceLabel(enrollment.classId, enrollment.billingPreference)}
                    {" · "}
                    {(enrollment.scheduleKeys?.length
                      ? enrollment.classId.schedules.filter((schedule) => enrollment.scheduleKeys?.includes(scheduleKey(schedule)))
                      : enrollment.classId.schedules
                    ).map(scheduleLabel).join(" · ") || "Sin horario"}
                  </small>
                </span>
                <button
                  title="Dar de baja"
                  disabled={busy}
                  onClick={() => void removeEnrollment(enrollment)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card + " " + styles.paymentsCard}>
          <div className={styles.cardHeader}>
            <div><span>CUENTA</span><h3>Pagos</h3></div>
            <Link href="/admin/payments"><CircleDollarSign size={15} /> Ver módulo pagos</Link>
          </div>

          <div className={styles.paymentTable}>
            <div className={styles.paymentHead}>
              <span>Concepto</span><span>Fecha / período</span><span>Vencimiento</span><span>Importe</span><span>Estado</span><span>Acciones</span>
            </div>
            {data.payments.length === 0 && <p className={styles.empty}>Todavía no tiene pagos registrados.</p>}
            {data.payments.map((payment) => {
              const status = paymentStatus(payment);
              return (
                <div className={styles.paymentRow} key={payment._id}>
                  <span>
                    <strong>{payment.concept}</strong>
                    <small>{(payment.paymentType ?? "MONTHLY") === "PER_CLASS" ? "Por clase" : "Mensual"}</small>
                  </span>
                  <span>{paymentReference(payment)}</span>
                  <span>{formatDateOnly(payment.dueDate)}</span>
                  <span>$ {payment.amount.toLocaleString("es-AR")}</span>
                  <span className={status === "PAID" ? styles.statusPaid : status === "OVERDUE" ? styles.statusOverdue : styles.statusPending}>
                    {status === "PAID" ? "Pagado" : status === "OVERDUE" ? "Vencido" : "Pendiente"}
                  </span>
                  <span className={styles.rowActions}>
                    {status !== "PAID" && status !== "CANCELLED" && (
                      <button disabled={busy} onClick={() => setPaying(payment)}>Cobrar</button>
                    )}
                    {status !== "PAID" && status !== "CANCELLED" && student.email && (
                      <button disabled={busy} onClick={() => void remind(payment._id)}>Recordar</button>
                    )}
                    {status === "PAID" && (
                      <>
                        <a
                          href={apiUrl(`/admin/payments/${payment._id}/receipt.pdf`)}
                          target="_blank"
                          rel="noreferrer"
                          title="Ver recibo"
                        >
                          <FileText size={13} /> Ver recibo
                        </a>
                        <a
                          href={apiUrl(`/admin/payments/${payment._id}/receipt.pdf?download=1`)}
                          title="Descargar recibo"
                        >
                          <Download size={13} /> Descargar
                        </a>
                        {student.email && (
                          <button disabled={busy} onClick={() => void emailReceipt(payment._id)} title={`Enviar recibo a ${student.email}`}>
                            <Mail size={13} /> Email
                          </button>
                        )}
                        {student.phone && (
                          <button onClick={() => shareReceiptWhatsApp(payment)} title="Abrir WhatsApp Web y descargar el recibo para adjuntarlo">
                            <MessageCircle size={13} /> WhatsApp
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <LiveModal
        open={editing}
        title="Editar alumno"
        description="Actualizá los datos de la ficha."
        submitting={busy}
        onClose={() => setEditing(false)}
        onSubmit={saveStudent}
      >
        <Field label="Sede">
          <select name="branchId" required defaultValue={student.branchId}>
            {branches.filter((branch) => branch.isActive).map((branch) => (
              <option value={branch._id} key={branch._id}>{branch.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre"><input name="firstName" defaultValue={student.firstName} required /></Field>
        <Field label="Apellido"><input name="lastName" defaultValue={student.lastName} required /></Field>
        <Field label="Teléfono"><input name="phone" defaultValue={student.phone ?? ""} /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={student.email ?? ""} /></Field>
        <Field label="Fecha de nacimiento">
          <input name="birthDate" type="date" defaultValue={student.birthDate ? student.birthDate.slice(0, 10) : ""} />
        </Field>
        <Field label="Responsable"><input name="guardianName" defaultValue={student.guardianName ?? ""} /></Field>
        <Field label="Teléfono responsable"><input name="guardianPhone" defaultValue={student.guardianPhone ?? ""} /></Field>
        <Field label="Notas" wide><textarea name="notes" rows={4} defaultValue={student.notes ?? ""} /></Field>
      </LiveModal>

      <LiveModal
        open={enrollModal}
        title="Inscribir en una clase"
        description="Elegí la clase y, si admite ambas modalidades, cómo pagará actualmente el alumno."
        submitting={busy}
        onClose={() => setEnrollModal(false)}
        onSubmit={enroll}
        submitLabel="Inscribir alumno"
      >
        <Field label="Clase" wide>
          <select
            required
            value={selectedClassId}
            onChange={(event) => selectEnrollmentClass(event.target.value)}
          >
            <option value="" disabled>Seleccionar clase</option>
            {availableClasses.map((danceClass) => (
              <option key={danceClass._id} value={danceClass._id}>{danceClass.name}</option>
            ))}
          </select>
        </Field>

        {selectedClass && classBillingMode(selectedClass) === "BOTH" && (
          <Field label="Modalidad de pago" wide>
            <select
              value={selectedBillingPreference}
              onChange={(event) =>
                setSelectedBillingPreference(event.target.value as BillingPreference)
              }
            >
              <option value="PER_CLASS">Paga por clase</option>
              <option value="MONTHLY">Paga mensual</option>
            </select>
          </Field>
        )}

        {selectedClass && classBillingMode(selectedClass) !== "BOTH" && (
          <div className={styles.modalHint}>
            Modalidad de esta clase: {billingPreferenceLabel(selectedClass, selectedBillingPreference)}.
          </div>
        )}

        {selectedClass && selectedBillingPreference === "MONTHLY" && monthlyPlansAvailable(selectedClass) && (
          <Field label="Plan mensual" wide>
            <select value={selectedMonthlyPlan} onChange={(event) => setSelectedMonthlyPlan(Number(event.target.value) as 4 | 8)}>
              <option value={4}>4 clases · {"$ " + monthlyPriceFor(selectedClass, 4).toLocaleString("es-AR")}</option>
              <option value={8}>8 clases · {"$ " + monthlyPriceFor(selectedClass, 8).toLocaleString("es-AR")}</option>
            </select>
          </Field>
        )}

        {selectedClass && (
          <Field label="Turnos habituales" wide>
            <div className={styles.scheduleChoices}>
              {selectedClass.schedules.map((schedule) => {
                const key = scheduleKey(schedule);
                return (
                  <label key={key} className={styles.scheduleChoice}>
                    <input
                      type="checkbox"
                      checked={selectedScheduleKeys.includes(key)}
                      onChange={(event) => setSelectedScheduleKeys((current) =>
                        event.target.checked ? [...current, key] : current.filter((item) => item !== key)
                      )}
                    />
                    {scheduleLabel(schedule)}
                  </label>
                );
              })}
            </div>
            <small>Elegí uno o más turnos. Los cambios puntuales de fecha no modifican esta selección.</small>
          </Field>
        )}
      </LiveModal>

      <LiveModal
        open={Boolean(paying)}
        title="Registrar cobro"
        description={paying ? paying.concept + " · $ " + paying.amount.toLocaleString("es-AR") : ""}
        submitting={busy}
        onClose={() => setPaying(null)}
        onSubmit={markPaid}
        submitLabel="Confirmar cobro"
      >
        <Field label="Medio de pago">
          <select name="paymentMethod" defaultValue="CASH" required>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otro</option>
          </select>
        </Field>
        <Field label="Fecha de pago">
          <input name="paidAt" type="date" defaultValue={todayInArgentina()} />
        </Field>
      </LiveModal>
    </>
  );
}
