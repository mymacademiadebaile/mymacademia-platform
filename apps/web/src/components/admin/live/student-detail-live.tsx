"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { BillingPreference, Branch, DanceClass, Payment, Student } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import {
  billingPreferenceLabel,
  classBillingMode,
  defaultBillingPreference,
  scheduleKey
} from "./student-detail-helpers";
import type { Enrollment, StudentDetail } from "./student-detail-types";
import { StudentDetailHero } from "./student-detail-hero";
import { StudentInfoCard } from "./student-detail-info-card";
import { StudentEnrollmentsCard } from "./student-detail-enrollments-card";
import { StudentPaymentsCard } from "./student-detail-payments-card";
import { StudentEditModal } from "./student-detail-edit-modal";
import { StudentEnrollModal } from "./student-detail-enroll-modal";
import { StudentPayModal } from "./student-detail-pay-modal";
import { useStudentPaymentActions } from "./student-detail-receipts";
import styles from "./student-detail.module.css";

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
  const { remind, emailReceipt, shareReceiptWhatsApp } = useStudentPaymentActions({
    student: data?.student,
    setBusy,
    setError
  });

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

  if (!data) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  const { student, financial } = data;

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

      <div className={styles.grid}>
        <StudentInfoCard student={student} branches={branches} />
        <StudentEnrollmentsCard
          enrollments={activeEnrollments}
          busy={busy}
          onEnroll={openEnrollmentModal}
          onRemove={(enrollment) => void removeEnrollment(enrollment)}
        />
        <StudentPaymentsCard
          payments={data.payments}
          student={student}
          busy={busy}
          onCharge={setPaying}
          onRemind={(paymentId) => void remind(paymentId)}
          onEmailReceipt={(paymentId) => void emailReceipt(paymentId)}
          onShareWhatsApp={shareReceiptWhatsApp}
        />
      </div>

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
        payment={paying}
        busy={busy}
        onClose={() => setPaying(null)}
        onSubmit={markPaid}
      />
    </>
  );
}
