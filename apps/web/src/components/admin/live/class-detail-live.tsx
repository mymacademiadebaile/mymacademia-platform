"use client";

import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Gift,
  Plus,
  Power,
  Trash2,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type {
  BillingMode,
  BillingPreference,
  Branch,
  CatalogItem,
  DanceClass,
  Paginated,
  Professor,
  Student
} from "./live-types";
import { ErrorBlock, Field, LiveModal, LoadingBlock, WebSwitch } from "./live-common";
import styles from "./class-detail.module.css";

const dayLabels: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo"
};

type ScheduleDraft = { day: string; startTime: string; endTime: string };

type Enrollment = {
  _id: string;
  studentId: Student;
  enrolledAt: string;
  billingPreference?: BillingPreference;
};

type TrialBooking = {
  _id: string;
  studentId: Student;
  scheduledFor: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "CONVERTED";
  notes?: string;
};

type TrialResponse = { items: TrialBooking[] };
type EnrollmentResponse = {
  items: Enrollment[];
  capacity: number;
  occupied: number;
  available: number;
};

function refId(value: { _id: string } | string) {
  return typeof value === "string" ? value : value._id;
}

function refName(value: { name?: string; displayName?: string } | string) {
  return typeof value === "string" ? value : value.displayName ?? value.name ?? "Sin nombre";
}

function normalizedMode(danceClass: DanceClass): BillingMode {
  return danceClass.billingMode ?? "MONTHLY";
}

function billingLabel(danceClass: DanceClass) {
  const mode = normalizedMode(danceClass);
  if (mode === "FREE") return "Sin cargo";
  if (mode === "PER_CLASS") return "$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR") + " por clase";
  if (mode === "MONTHLY") return "$ " + (danceClass.monthlyPrice ?? 0).toLocaleString("es-AR") + " mensual";
  return "$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR") + " por clase o $ " + (danceClass.monthlyPrice ?? 0).toLocaleString("es-AR") + " mensual";
}

function preferenceForClass(danceClass: DanceClass): BillingPreference | undefined {
  const mode = normalizedMode(danceClass);
  if (mode === "PER_CLASS") return "PER_CLASS";
  if (mode === "MONTHLY") return "MONTHLY";
  if (mode === "BOTH") return "PER_CLASS";
  return undefined;
}

function preferenceLabel(preference?: BillingPreference) {
  if (preference === "MONTHLY") return "Mensual";
  if (preference === "PER_CLASS") return "Por clase";
  return "Sin cargo";
}

function localDateValue() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function ClassDetailLive({ id }: { id: string }) {
  const { toast, confirm } = useAdminFeedback();
  const router = useRouter();
  const [danceClass, setDanceClass] = useState<DanceClass | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentResponse | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [trials, setTrials] = useState<TrialBooking[]>([]);
  const [trialStudentId, setTrialStudentId] = useState("");
  const [trialDate, setTrialDate] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [studentId, setStudentId] = useState("");
  const [billingPreference, setBillingPreference] = useState<BillingPreference>("PER_CLASS");
  const [editing, setEditing] = useState(false);
  const [chargingEnrollment, setChargingEnrollment] = useState<Enrollment | null>(null);
  const [chargePaymentType, setChargePaymentType] = useState<BillingPreference>("PER_CLASS");
  const [chargeAmount, setChargeAmount] = useState(0);
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [editBillingMode, setEditBillingMode] = useState<BillingMode>("PER_CLASS");
  const [editSchedules, setEditSchedules] = useState<ScheduleDraft[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");

    try {
      const [classData, enrollmentData, trialData, studentData, branchList, professorList, catalogList] = await Promise.all([
        apiFetch<DanceClass>("/admin/classes/" + id),
        apiFetch<EnrollmentResponse>("/admin/enrollments?classId=" + id),
        apiFetch<TrialResponse>("/admin/trials?classId=" + id),
        apiFetch<Paginated<Student>>("/admin/students?limit=100&isActive=true"),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<Professor[]>("/admin/professors?isActive=true"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);
      setDanceClass(classData);
      setEnrollments(enrollmentData);
      setTrials(trialData.items);
      setStudents(studentData.items);
      setBranches(branchList.filter((item) => item.isActive));
      setProfessors(professorList.filter((item) => item.isActive));
      setCatalogs(catalogList.filter((item) => item.isActive));
      setBillingPreference(preferenceForClass(classData) ?? "PER_CLASS");
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const enrolledIds = useMemo(
    () => new Set(enrollments?.items.map((item) => item.studentId._id) ?? []),
    [enrollments]
  );

  const availableStudents = students.filter(
    (student) => !enrolledIds.has(student._id) && (!danceClass || student.branchId === danceClass.branchId)
  );

  const scheduledTrialIds = new Set(
    trials.filter((trial) => trial.status === "SCHEDULED").map((trial) => trial.studentId._id)
  );
  const availableTrialStudents = availableStudents.filter(
    (student) => !scheduledTrialIds.has(student._id)
  );

  const disciplines = catalogs.filter((item) => item.type === "DISCIPLINE");
  const segments = catalogs.filter((item) => item.type === "SEGMENT");
  const levels = catalogs.filter((item) => item.type === "LEVEL");

  function openEdit() {
    if (!danceClass) return;
    setEditSchedules(danceClass.schedules.map((schedule) => ({ ...schedule })));
    setEditBillingMode(normalizedMode(danceClass));
    setEditing(true);
  }

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setEditSchedules((current) =>
      current.map((schedule, scheduleIndex) =>
        scheduleIndex === index ? { ...schedule, ...patch } : schedule
      )
    );
  }

  async function enroll() {
    if (!studentId || !danceClass) return;
    setBusy(true);
    setError("");

    try {
      await apiFetch("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({
          classId: id,
          studentId,
          billingPreference: normalizedMode(danceClass) === "FREE" ? undefined : billingPreference
        })
      });
      setStudentId("");
      toast({ title: "Alumno inscripto", description: "Modalidad: " + preferenceLabel(billingPreference) + "." });
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo inscribir", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(enrollment: Enrollment) {
    const approved = await confirm({
      title: "Dar de baja la inscripción",
      description: "Se quitará a " + enrollment.studentId.firstName + " " + enrollment.studentId.lastName + " de esta clase. El historial se conserva.",
      confirmLabel: "Dar de baja",
      tone: "danger"
    });
    if (!approved) return;

    setBusy(true);
    try {
      await apiFetch<void>("/admin/enrollments/" + enrollment._id, { method: "DELETE" });
      toast("Inscripción dada de baja");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo dar de baja", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function changeBilling(enrollment: Enrollment, next: BillingPreference) {
    const currentPreference = enrollment.billingPreference ?? preferenceForClass(danceClass!);
    if (next === currentPreference) return;

    const approved = await confirm({
      title: "Cambiar modalidad de cobro",
      description: enrollment.studentId.firstName + " pasará de " + preferenceLabel(currentPreference) + " a " + preferenceLabel(next) + ". Los pagos históricos no se modifican.",
      confirmLabel: "Cambiar modalidad"
    });
    if (!approved) return;

    setBusy(true);
    try {
      await apiFetch("/admin/enrollments/" + enrollment._id + "/billing-preference", {
        method: "PATCH",
        body: JSON.stringify({ billingPreference: next })
      });
      toast("Modalidad de cobro actualizada");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo actualizar", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  function openCharge(enrollment: Enrollment) {
    if (!danceClass || normalizedMode(danceClass) === "FREE") return;

    const paymentType = enrollment.billingPreference ?? preferenceForClass(danceClass) ?? "PER_CLASS";
    setChargingEnrollment(enrollment);
    setChargePaymentType(paymentType);
    setChargeAmount(paymentType === "MONTHLY" ? danceClass.monthlyPrice ?? 0 : danceClass.pricePerClass ?? 0);
  }

  function changeChargePaymentType(paymentType: BillingPreference) {
    if (!danceClass) return;
    setChargePaymentType(paymentType);
    setChargeAmount(paymentType === "MONTHLY" ? danceClass.monthlyPrice ?? 0 : danceClass.pricePerClass ?? 0);
  }

  async function registerCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chargingEnrollment || !danceClass) return;

    const form = new FormData(event.currentTarget);
    setChargeSubmitting(true);

    try {
      await apiFetch("/admin/payments/quick-charge", {
        method: "POST",
        body: JSON.stringify({
          studentId: chargingEnrollment.studentId._id,
          classId: danceClass._id,
          paymentType: chargePaymentType,
          classDate: chargePaymentType === "PER_CLASS" ? form.get("classDate") : undefined,
          period: chargePaymentType === "MONTHLY" ? form.get("period") : undefined,
          amount: chargeAmount,
          paymentMethod: form.get("paymentMethod"),
          paidAt: form.get("paidAt") || undefined,
          notes: form.get("notes")
        })
      });
      setChargingEnrollment(null);
      toast({
        title: "Cobro registrado",
        description: chargingEnrollment.studentId.firstName + " " + chargingEnrollment.studentId.lastName + " · " + danceClass.name
      });
    } catch (requestError) {
      toast({ title: "No se pudo registrar el cobro", description: apiMessage(requestError), tone: "error" });
    } finally {
      setChargeSubmitting(false);
    }
  }

  async function scheduleTrial() {
    if (!trialStudentId || !trialDate) return;
    setBusy(true);

    try {
      await apiFetch("/admin/trials", {
        method: "POST",
        body: JSON.stringify({
          classId: id,
          studentId: trialStudentId,
          scheduledFor: trialDate + "T12:00:00"
        })
      });
      setTrialStudentId("");
      setTrialDate("");
      toast("Clase de prueba agendada");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo agendar", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function updateTrial(trial: TrialBooking, status: "COMPLETED" | "CANCELLED") {
    if (status === "CANCELLED") {
      const approved = await confirm({
        title: "Cancelar clase de prueba",
        description: "Se cancelará la prueba de " + trial.studentId.firstName + " " + trial.studentId.lastName + ".",
        confirmLabel: "Cancelar prueba",
        tone: "danger"
      });
      if (!approved) return;
    }

    setBusy(true);
    try {
      await apiFetch("/admin/trials/" + trial._id, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      toast(status === "COMPLETED" ? "Prueba marcada como realizada" : "Prueba cancelada");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo actualizar la prueba", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function convertTrial(trialId: string) {
    setBusy(true);
    try {
      await apiFetch("/admin/trials/" + trialId + "/convert", { method: "POST" });
      toast("La prueba se convirtió en inscripción");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo convertir la prueba", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      await apiFetch("/admin/classes/" + id, {
        method: "PATCH",
        body: JSON.stringify({
          branchId: form.get("branchId"),
          name: form.get("name"),
          professorIds: form.getAll("professorIds"),
          disciplineIds: form.getAll("disciplineIds"),
          segmentIds: form.getAll("segmentIds"),
          levelIds: form.getAll("levelIds"),
          capacity: Number(form.get("capacity")),
          billingMode: editBillingMode,
          pricePerClass: Number(form.get("pricePerClass") || 0),
          monthlyPrice: Number(form.get("monthlyPrice") || 0),
          freeTrialEnabled: form.get("freeTrialEnabled") === "on",
          schedules: editSchedules
        })
      });
      setEditing(false);
      toast("Clase actualizada");
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo guardar la clase", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    if (!danceClass) return;
    const nextActive = danceClass.status !== "ACTIVE";
    const approved = await confirm({
      title: nextActive ? "Reactivar clase" : "Inactivar clase",
      description: nextActive
        ? "La clase volverá a estar disponible para gestión e inscripciones."
        : "La clase dejará de aceptar nuevas inscripciones. Los datos históricos se conservan.",
      confirmLabel: nextActive ? "Reactivar" : "Inactivar",
      tone: nextActive ? "default" : "danger"
    });
    if (!approved) return;

    setBusy(true);
    try {
      await apiFetch("/admin/classes/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status: nextActive ? "ACTIVE" : "INACTIVE" })
      });
      toast(nextActive ? "Clase reactivada" : "Clase inactivada");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo cambiar el estado", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteClass() {
    if (!danceClass) return;

    const approved = await confirm({
      title: "Eliminar clase definitivamente",
      description: `Se eliminará ${danceClass.name} de forma permanente. Solo se puede borrar si no tiene inscripciones, pagos, sesiones ni pruebas registradas.`,
      confirmLabel: "Eliminar definitivamente",
      tone: "danger"
    });
    if (!approved) return;

    setBusy(true);
    try {
      await apiFetch<void>("/admin/classes/" + id, { method: "DELETE" });
      toast("Clase eliminada definitivamente");
      router.push("/admin/classes");
    } catch (requestError) {
      toast({
        title: "No se pudo eliminar la clase",
        description: apiMessage(requestError),
        tone: "error"
      });
    } finally {
      setBusy(false);
    }
  }

  async function setPublishOnWeb(next: boolean) {
    setBusy(true);
    try {
      await apiFetch("/admin/classes/" + id, {
        method: "PATCH",
        body: JSON.stringify({ publishOnWeb: next })
      });
      toast(next ? "La clase se muestra en la web" : "La clase se oculta de la web");
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo cambiar la visibilidad", description: apiMessage(requestError), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!danceClass || !enrollments) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const selectedProfessorIds = danceClass.professorIds.map(refId);
  const selectedDisciplineIds = danceClass.disciplineIds.map(refId);
  const selectedSegmentIds = danceClass.segmentIds.map(refId);
  const selectedLevelIds = danceClass.levelIds.map(refId);
  const mode = normalizedMode(danceClass);

  return (
    <>
      <Link href="/admin/classes" className={styles.back}><ArrowLeft size={15} /> Volver a clases</Link>

      <PageHeader
        eyebrow="GESTIÓN DE CLASE"
        title={danceClass.name}
        description="Horarios, profesores, precios, pruebas, cupo y alumnos inscriptos."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <section className={styles.hero}>
        <div>
          <span className={danceClass.status === "ACTIVE" ? styles.active : styles.inactive}>
            {danceClass.status === "ACTIVE" ? "Clase activa" : "Clase inactiva"}
          </span>
          <h2>{danceClass.name}</h2>
          <p>{danceClass.professorIds.map(refName).join(", ")} · {billingLabel(danceClass)}{danceClass.freeTrialEnabled ? " · Prueba disponible" : ""}</p>
        </div>
        <div className={styles.heroActions}>
          <button onClick={openEdit}>Editar clase</button>
          <button className={styles.dangerAction} disabled={busy} onClick={() => void toggleStatus()}>
            <Power size={15} /> {danceClass.status === "ACTIVE" ? "Inactivar" : "Reactivar"}
          </button>
          <button className={styles.dangerAction} disabled={busy} onClick={() => void deleteClass()}>
            <Trash2 size={15} /> Eliminar
          </button>
        </div>
      </section>

      <div className={styles.webToggle}>
        <WebSwitch
          label="Mostrar en la web"
          checked={danceClass.publishOnWeb !== false}
          busy={busy}
          describedBy="class-web-help"
          onChange={(next) => void setPublishOnWeb(next)}
        />
        <p id="class-web-help">
          La clase aparece en el horario público solo si su ritmo está publicado.
        </p>
      </div>

      <div className={styles.stats}>
        <article><UsersRound size={17} /><span>Inscriptos</span><strong>{enrollments.occupied}</strong></article>
        <article><span className={styles.metricIcon}>C</span><span>Cupo total</span><strong>{enrollments.capacity}</strong></article>
        <article><Plus size={17} /><span>Disponibles</span><strong>{enrollments.available}</strong></article>
        <article><Clock3 size={17} /><span>Horarios</span><strong>{danceClass.schedules.length}</strong></article>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}><span>HORARIOS</span><h3>Agenda semanal</h3></div>
          <div className={styles.scheduleList}>
            {danceClass.schedules.map((schedule, index) => (
              <div key={index}>
                <CalendarDays size={16} />
                <strong>{dayLabels[schedule.day] ?? schedule.day}</strong>
                <span>{schedule.startTime}–{schedule.endTime}</span>
              </div>
            ))}
          </div>
          <div className={styles.tags}>
            {[...danceClass.disciplineIds, ...danceClass.segmentIds, ...danceClass.levelIds].map((item) => (
              <span key={refId(item)}>{refName(item)}</span>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}><span>INSCRIPCIÓN</span><h3>Agregar alumno</h3></div>
          <div className={styles.enrollBox}>
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Seleccionar alumno de la sede</option>
              {availableStudents.map((student) => (
                <option value={student._id} key={student._id}>{student.firstName} {student.lastName}</option>
              ))}
            </select>
            {mode === "BOTH" && (
              <select value={billingPreference} onChange={(event) => setBillingPreference(event.target.value as BillingPreference)}>
                <option value="PER_CLASS">Paga por clase</option>
                <option value="MONTHLY">Paga mensual</option>
              </select>
            )}
            <button disabled={!studentId || busy || enrollments.available <= 0 || danceClass.status !== "ACTIVE"} onClick={() => void enroll()}>
              <Plus size={15} /> Inscribir
            </button>
          </div>
          {mode !== "BOTH" && <p className={styles.helper}>Modalidad: {preferenceLabel(preferenceForClass(danceClass))}.</p>}
          {enrollments.available <= 0 && <p className={styles.helper}>La clase alcanzó el cupo máximo.</p>}
        </section>

        {danceClass.freeTrialEnabled && (
          <section className={styles.card + " " + styles.trialCard}>
            <div className={styles.cardHeader}><span>PRUEBA</span><h3>Clases de prueba</h3></div>
            <div className={styles.trialComposer}>
              <select value={trialStudentId} onChange={(event) => setTrialStudentId(event.target.value)}>
                <option value="">Seleccionar alumno</option>
                {availableTrialStudents.map((student) => (
                  <option value={student._id} key={student._id}>{student.firstName} {student.lastName}</option>
                ))}
              </select>
              <input type="date" value={trialDate} onChange={(event) => setTrialDate(event.target.value)} />
              <button disabled={!trialStudentId || !trialDate || busy} onClick={() => void scheduleTrial()}>
                <Gift size={15} /> Agendar prueba
              </button>
            </div>

            <div className={styles.trialList}>
              {trials.length === 0 && <p className={styles.helper}>Todavía no hay pruebas agendadas.</p>}
              {trials.map((trial) => (
                <div key={trial._id}>
                  <span>
                    <strong>{trial.studentId.firstName} {trial.studentId.lastName}</strong>
                    <small>{new Date(trial.scheduledFor).toLocaleDateString("es-AR")} · {
                      trial.status === "SCHEDULED" ? "Agendada" :
                      trial.status === "COMPLETED" ? "Realizada" :
                      trial.status === "CONVERTED" ? "Inscripto/a" : "Cancelada"
                    }</small>
                  </span>
                  <div>
                    {trial.status === "SCHEDULED" && (
                      <>
                        <button onClick={() => void updateTrial(trial, "COMPLETED")} disabled={busy}>Realizada</button>
                        <button onClick={() => void updateTrial(trial, "CANCELLED")} disabled={busy}>Cancelar</button>
                      </>
                    )}
                    {(trial.status === "SCHEDULED" || trial.status === "COMPLETED") && (
                      <button className={styles.convertTrial} onClick={() => void convertTrial(trial._id)} disabled={busy}>Inscribir</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.card + " " + styles.studentsCard}>
          <div className={styles.cardHeader}><span>ALUMNOS</span><h3>Inscriptos actuales</h3></div>
          <div className={styles.studentList}>
            {enrollments.items.length === 0 && <p className={styles.helper}>Todavía no hay alumnos inscriptos.</p>}
            {enrollments.items.map((enrollment) => (
              <div key={enrollment._id}>
                <Link href={"/admin/students/" + enrollment.studentId._id} className={styles.studentIdentity}>
                  <span>{enrollment.studentId.firstName[0]}{enrollment.studentId.lastName[0]}</span>
                  <span>
                    <strong>{enrollment.studentId.firstName} {enrollment.studentId.lastName}</strong>
                    <small>{preferenceLabel(enrollment.billingPreference ?? preferenceForClass(danceClass))} · {enrollment.studentId.phone || enrollment.studentId.email || "Sin contacto"}</small>
                  </span>
                </Link>
                {mode === "BOTH" && (
                  <select
                    value={enrollment.billingPreference ?? "PER_CLASS"}
                    disabled={busy}
                    onChange={(event) => void changeBilling(enrollment, event.target.value as BillingPreference)}
                  >
                    <option value="PER_CLASS">Por clase</option>
                    <option value="MONTHLY">Mensual</option>
                  </select>
                )}
                <div className={styles.studentActions}>
                  {mode !== "FREE" && (
                    <button className={styles.chargeAction} title="Registrar cobro" disabled={busy} onClick={() => openCharge(enrollment)}>
                      <CircleDollarSign size={14} /> Cobrar
                    </button>
                  )}
                  <button title="Dar de baja" disabled={busy} onClick={() => void remove(enrollment)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <LiveModal
        open={Boolean(chargingEnrollment)}
        title="Registrar cobro"
        description={chargingEnrollment ? chargingEnrollment.studentId.firstName + " " + chargingEnrollment.studentId.lastName + " · " + danceClass.name : ""}
        submitting={chargeSubmitting}
        onClose={() => setChargingEnrollment(null)}
        onSubmit={registerCharge}
        submitLabel="Registrar cobro"
      >
        {mode === "BOTH" && (
          <Field label="Modalidad">
            <select value={chargePaymentType} onChange={(event) => changeChargePaymentType(event.target.value as BillingPreference)}>
              <option value="PER_CLASS">Por clase</option>
              <option value="MONTHLY">Mensual</option>
            </select>
          </Field>
        )}
        {chargePaymentType === "PER_CLASS" ? (
          <Field label="Fecha de la clase"><input name="classDate" type="date" defaultValue={localDateValue()} required /></Field>
        ) : (
          <Field label="Período"><input name="period" type="month" defaultValue={localDateValue().slice(0, 7)} required /></Field>
        )}
        <Field label="Importe">
          <input value={chargeAmount || ""} onChange={(event) => setChargeAmount(Number(event.target.value))} type="number" min="1" step="0.01" required />
        </Field>
        <Field label="Medio de pago">
          <select name="paymentMethod" defaultValue="CASH" required>
            <option value="CASH">Efectivo</option>
            <option value="TRANSFER">Transferencia</option>
            <option value="CARD">Tarjeta</option>
            <option value="OTHER">Otro</option>
          </select>
        </Field>
        <Field label="Fecha de pago"><input name="paidAt" type="date" defaultValue={localDateValue()} /></Field>
        <Field label="Notas" wide><textarea name="notes" rows={3} /></Field>
      </LiveModal>

      <LiveModal
        open={editing}
        title="Editar clase"
        description="Podés cambiar precios, modalidad, profesores y horarios."
        submitting={busy}
        onClose={() => setEditing(false)}
        onSubmit={saveClass}
      >
        <Field label="Sede">
          <select name="branchId" defaultValue={danceClass.branchId} required>
            {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre"><input name="name" defaultValue={danceClass.name} required /></Field>
        <Field label="Cupo"><input name="capacity" type="number" min={1} defaultValue={danceClass.capacity} required /></Field>
        <Field label="Modalidad de cobro">
          <select value={editBillingMode} onChange={(event) => setEditBillingMode(event.target.value as BillingMode)}>
            <option value="PER_CLASS">Por clase</option>
            <option value="MONTHLY">Mensual</option>
            <option value="BOTH">Por clase o mensual</option>
            <option value="FREE">Sin cargo</option>
          </select>
        </Field>
        {(editBillingMode === "PER_CLASS" || editBillingMode === "BOTH") && (
          <Field label="Precio por clase (ARS)">
            <input name="pricePerClass" type="number" min={1} step="1" defaultValue={danceClass.pricePerClass ?? 0} required />
          </Field>
        )}
        {(editBillingMode === "MONTHLY" || editBillingMode === "BOTH") && (
          <Field label="Precio mensual (ARS)">
            <input name="monthlyPrice" type="number" min={1} step="1" defaultValue={danceClass.monthlyPrice ?? 0} required />
          </Field>
        )}
        <Field label="Clase de prueba" wide>
          <label className={styles.switchRow}>
            <input name="freeTrialEnabled" type="checkbox" defaultChecked={danceClass.freeTrialEnabled} />
            <span>Permitir una clase gratuita de prueba.</span>
          </label>
        </Field>
        <Field label="Profesores" wide>
          <select name="professorIds" multiple defaultValue={selectedProfessorIds} size={Math.min(5, Math.max(3, professors.length))} required>
            {professors.map((professor) => <option key={professor._id} value={professor._id}>{professor.displayName}</option>)}
          </select>
        </Field>
        <Field label="Disciplinas">
          <select name="disciplineIds" multiple defaultValue={selectedDisciplineIds} size={4} required>
            {disciplines.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Público">
          <select name="segmentIds" multiple defaultValue={selectedSegmentIds} size={3} required>
            {segments.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="Niveles">
          <select name="levelIds" multiple defaultValue={selectedLevelIds} size={3} required>
            {levels.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
          </select>
        </Field>

        <div className={styles.scheduleEditor}>
          <div className={styles.scheduleEditorHeader}>
            <strong>Horarios</strong>
            <button type="button" onClick={() => setEditSchedules((current) => [...current, { day: "MONDAY", startTime: "18:00", endTime: "19:00" }])}>
              <Plus size={14} /> Agregar
            </button>
          </div>
          {editSchedules.map((schedule, index) => (
            <div className={styles.scheduleEditorRow} key={index}>
              <select value={schedule.day} onChange={(event) => updateSchedule(index, { day: event.target.value })}>
                {Object.entries(dayLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="time" value={schedule.startTime} onChange={(event) => updateSchedule(index, { startTime: event.target.value })} />
              <input type="time" value={schedule.endTime} onChange={(event) => updateSchedule(index, { endTime: event.target.value })} />
              <button type="button" disabled={editSchedules.length === 1} onClick={() => setEditSchedules((current) => current.filter((_, i) => i !== index))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </LiveModal>
    </>
  );
}
