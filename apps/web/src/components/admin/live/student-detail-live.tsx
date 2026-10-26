"use client";

import { collectedToast, proofFileOf, tryUploadProof } from "../billing/proof";
import { useVoidCollection } from "../billing/void-collection";
import { ArrowLeft, LayoutDashboard, Mail, QrCode } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { StudentAccount } from "../billing/billing-types";
import { newIdempotencyKey } from "../scheduling/scheduling-types";
import type { BillingPreference, Branch, DanceClass, Student } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import {
  billingPreferenceLabel,
  classBillingMode,
  defaultBillingPreference,
  defaultMonthlyPlan,
  scheduleKey
} from "./student-detail-helpers";
import type { AccountCharge, Enrollment, StudentDetail } from "./student-detail-types";
import { StudentDetailHero } from "./student-detail-hero";
import { StudentInfoCard } from "./student-detail-info-card";
import { StudentEnrollmentsCard } from "./student-detail-enrollments-card";
import { StudentPaymentsCard } from "./student-detail-payments-card";
import { StudentEditModal } from "./student-detail-edit-modal";
import { StudentEnrollModal } from "./student-detail-enroll-modal";
import { StudentPayModal } from "./student-detail-pay-modal";
import { useStudentPaymentActions } from "./student-detail-receipts";
import { StudentIdentityPanel } from "./student-identity-panel";
import { DebtRemindersLive } from "../reminders/debt-reminders-live";
import styles from "./student-detail-live.module.css";

export function StudentDetailLive({ id }: { id: string }) {
  const { toast, confirm } = useAdminFeedback();
  const [data, setData] = useState<StudentDetail | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<"overview" | "identity" | "reminders">("overview");
  const [identityOpened, setIdentityOpened] = useState(false);
  const [contactRequested, setContactRequested] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [account, setAccount] = useState<StudentAccount | null>(null);
  const [paying, setPaying] = useState<AccountCharge | null>(null);
  // One key per payment dialog: a repeated submit answers with the first collection instead of charging twice.
  const [payKey, setPayKey] = useState(newIdempotencyKey);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedBillingPreference, setSelectedBillingPreference] =
    useState<BillingPreference>("PER_CLASS");
  const [selectedMonthlyPlan, setSelectedMonthlyPlan] = useState<4 | 8>(4);
  const [selectedScheduleKeys, setSelectedScheduleKeys] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { openVoid, voidModal } = useVoidCollection(() => load());
  const { remind, emailReceipt, shareReceiptWhatsApp } = useStudentPaymentActions({
    student: data?.student,
    setBusy,
    setError
  });

  const load = useCallback(async () => {
    setError("");

    try {
      const [detail, accountData, branchList, classList] = await Promise.all([
        apiFetch<StudentDetail>(`/admin/students/${id}`),
        apiFetch<StudentAccount>(`/admin/billing/students/${id}/account`),
        apiFetch<Branch[]>("/admin/branches"),
        apiFetch<DanceClass[]>("/admin/classes")
      ]);
      setData(detail);
      setAccount(accountData);
      setBranches(branchList);
      setClasses(classList);
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (section !== "identity" || !contactRequested) return;
    document.getElementById("student-contact-settings")?.scrollIntoView({ block: "start", behavior: "smooth" });
    setContactRequested(false);
  }, [section, contactRequested]);

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
    setSelectedMonthlyPlan(danceClass ? defaultMonthlyPlan(danceClass) : 4);
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
          dni: form.get("dni"),
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

  function openPay(charge: AccountCharge) {
    setPayKey(newIdempotencyKey());
    setPaying(charge);
  }

  async function markPaid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paying) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      const result = await apiFetch<{ collection: { id: string } }>("/admin/billing/collections", {
        method: "POST",
        body: JSON.stringify({
          studentId: id,
          amount: paying.balance,
          method: form.get("paymentMethod"),
          receivedAt: form.get("paidAt") || undefined,
          allocations: [{ chargeId: paying.id, amount: paying.balance }],
          idempotencyKey: payKey
        })
      });
      const proofError = await tryUploadProof(result.collection.id, proofFileOf(form));
      setPaying(null);
      toast(collectedToast(proofError, "Se generó el recibo."));
      await load();
    } catch (requestError) {
      const message = apiMessage(requestError);
      setError(message);
      toast({ title: "No se pudo registrar el pago", description: message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const { student, financial } = data;
  // Only the current billing model: charges with their collections (legacy payments are not operated here).
  const charges = (account?.charges ?? []).filter((item) => !item.legacy && item.status !== "VOID") as AccountCharge[];

  return (
    <>
      <Link href="/admin/students" className={styles.back}>
        <ArrowLeft size={15} /> Volver a alumnos
      </Link>

      <PageHeader
        eyebrow="FICHA DE ALUMNO"
        title={`${student.firstName} ${student.lastName}`}
        description="Datos personales, clases, modalidad de cobro, contacto y estado de cuenta."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <StudentDetailHero
        student={student}
        financial={financial}
        activeCount={activeEnrollments.length}
        busy={busy}
        onEdit={() => setEditing(true)}
        onToggleActive={() => void toggleActive()}
      />

      <nav className={styles.sectionNav} aria-label="Secciones de la ficha del alumno">
        <button type="button" aria-pressed={section === "overview"} onClick={() => setSection("overview")}><LayoutDashboard size={24} aria-hidden="true" /><span><strong>Resumen</strong><small>Datos, clases y pagos</small></span></button>
        <button type="button" aria-pressed={section === "identity"} onClick={() => { setIdentityOpened(true); setContactRequested(false); setSection("identity"); }}><QrCode size={24} aria-hidden="true" /><span><strong>QR e historial</strong><small>Credencial, pruebas y contacto</small></span></button>
        <button type="button" aria-pressed={section === "reminders"} onClick={() => setSection("reminders")}><Mail size={24} aria-hidden="true" /><span><strong>Recordatorios</strong><small>Vista previa e historial de envíos</small></span></button>
      </nav>

      {section === "overview" && <div className={styles.grid}>
        <StudentInfoCard student={student} branches={branches} />
        <StudentEnrollmentsCard
          enrollments={activeEnrollments}
          busy={busy}
          onEnroll={openEnrollmentModal}
          onRemove={(enrollment) => void removeEnrollment(enrollment)}
        />
        <StudentPaymentsCard
          charges={charges}
          student={student}
          busy={busy}
          onCharge={openPay}
          onRemind={(charge) => void remind(charge)}
          onEmailReceipt={(collectionId) => void emailReceipt(collectionId)}
          onShareWhatsApp={shareReceiptWhatsApp}
          onVoid={(charge) =>
            charge.lastCollection &&
            openVoid({
              id: charge.lastCollection.id,
              receiptNumber: charge.lastCollection.receiptNumber,
              amount: charge.paid,
              studentName: student.firstName + " " + student.lastName
            })
          }
        />
      </div>}
      {identityOpened && <div hidden={section !== "identity"}><StudentIdentityPanel id={id} name={`${student.firstName} ${student.lastName}`} refreshKey={`${student.firstName}:${student.lastName}:${student.email}:${student.phone}:${student.dni}`} onEditStudent={() => setEditing(true)} /></div>}
      {section === "reminders" && <DebtRemindersLive key={id} initialStudentId={id} embedded onShowContact={() => { setIdentityOpened(true); setContactRequested(true); setSection("identity"); }} />}

      <StudentEditModal
        open={editing}
        student={student}
        branches={branches}
        busy={busy}
        onClose={() => setEditing(false)}
        onSubmit={saveStudent}
      />

      <StudentEnrollModal
        open={enrollModal}
        busy={busy}
        availableClasses={availableClasses}
        selectedClass={selectedClass}
        selectedClassId={selectedClassId}
        selectedBillingPreference={selectedBillingPreference}
        selectedMonthlyPlan={selectedMonthlyPlan}
        selectedScheduleKeys={selectedScheduleKeys}
        onSelectClass={selectEnrollmentClass}
        onBillingPreferenceChange={setSelectedBillingPreference}
        onMonthlyPlanChange={setSelectedMonthlyPlan}
        onScheduleKeysChange={setSelectedScheduleKeys}
        onClose={() => setEnrollModal(false)}
        onSubmit={enroll}
      />

      <StudentPayModal
        charge={paying}
        busy={busy}
        onClose={() => setPaying(null)}
        onSubmit={markPaid}
      />
      {voidModal}
    </>
  );
}
