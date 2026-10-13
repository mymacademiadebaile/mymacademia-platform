import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MidMonthPolicy } from "@mym/shared";
import { ApiError, apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import type { BillingPreference, DanceClass } from "./live-types";
import type { Enrollment, TrialBooking } from "./class-detail-types";
import { monthlyPlansAvailable, monthlyPriceFor, normalizedMode, preferenceForClass, preferenceLabel } from "./class-detail-helpers";
import type { FirstMonthChoice, FirstMonthTarget } from "../billing/first-month-modal";
import { todayInArgentina } from "@/lib/dates";

export type EnrollFormValues = {
  studentId: string;
  billingPreference: BillingPreference;
  monthlyPlan: 4 | 8;
  startDate: string;
  joinPolicy: "" | MidMonthPolicy;
  joinCustomAmount: string;
  selectedSeries: string[];
};

type Params = {
  id: string;
  danceClass: DanceClass | null;
  load: () => Promise<void>;
  setBusy: (busy: boolean) => void;
  setError: (message: string) => void;
};

export function useClassActions({ id, danceClass, load, setBusy, setError }: Params) {
  const { toast, confirm } = useAdminFeedback();
  const router = useRouter();
  const [switching, setSwitching] = useState<(FirstMonthTarget & { midMonth: boolean }) | null>(null);

  async function enroll(values: EnrollFormValues, onEnrolled: () => void) {
    const { studentId, billingPreference, monthlyPlan, startDate, joinPolicy, joinCustomAmount, selectedSeries } = values;
    if (!studentId || !danceClass) return;
    const effectiveMode = normalizedMode(danceClass) === "BOTH" ? billingPreference : preferenceForClass(danceClass);
    const midMonth = effectiveMode === "MONTHLY" && startDate.slice(8, 10) !== "01";
    if (midMonth && !joinPolicy) {
      toast({ title: "Elegí cómo cobrar el primer mes", description: "El alumno empieza a mitad de mes.", tone: "warning" });
      return;
    }
    setBusy(true);
    setError("");

    try {
      const created = await apiFetch<{ firstMonth?: { needsDecision: boolean; period: string } }>("/admin/enrollments", {
        method: "POST",
        body: JSON.stringify({
          classId: id,
          studentId,
          billingPreference: normalizedMode(danceClass) === "FREE" ? undefined : billingPreference,
          monthlyPlan: effectiveMode === "MONTHLY" ? monthlyPlan : undefined,
          startDate,
          seriesIds: selectedSeries.length ? selectedSeries : undefined,
          joinPolicy: midMonth ? joinPolicy : undefined,
          joinCustomAmount: midMonth && joinPolicy === "CUSTOM" ? Number(joinCustomAmount) : undefined
        })
      });
      onEnrolled();
      toast(
        created.firstMonth?.needsDecision
          ? { title: "Alumno inscripto", description: "Falta definir el cobro del primer mes desde su cuenta.", tone: "warning" }
          : { title: "Alumno inscripto", description: "Modalidad: " + preferenceLabel(billingPreference) + "." }
      );
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

    // Going monthly needs the plan and, with the month already started, how to bill the first month.
    if (next === "MONTHLY") {
      const period = todayInArgentina().slice(0, 7);
      setSwitching({
        enrollmentId: enrollment._id,
        studentName: enrollment.studentId.firstName + " " + enrollment.studentId.lastName,
        className: danceClass!.name,
        period,
        midMonth: todayInArgentina().slice(8, 10) !== "01",
        plans: monthlyPlansAvailable(danceClass!)
          ? { price4: monthlyPriceFor(danceClass!, 4), price8: monthlyPriceFor(danceClass!, 8), current: enrollment.monthlyPlan ?? 4 }
          : undefined
      });
      return;
    }

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

  /** Switch to monthly: saves the plan, then creates this month's fee with the chosen first-month rule. */
  async function switchToMonthly(choice: FirstMonthChoice) {
    if (!switching) return;
    setBusy(true);
    try {
      await apiFetch("/admin/enrollments/" + switching.enrollmentId + "/billing-preference", {
        method: "PATCH",
        body: JSON.stringify({ billingPreference: "MONTHLY", monthlyPlan: choice.plan })
      });
      try {
        await apiFetch("/admin/billing/enrollments/" + switching.enrollmentId + "/monthly-charge", {
          method: "POST",
          body: JSON.stringify({ period: switching.period, policy: switching.midMonth ? choice.policy : undefined, customAmount: choice.customAmount })
        });
      } catch (requestError) {
        // The fee of this month may already exist (it was monthly before): the switch itself is done.
        if (!(requestError instanceof ApiError && requestError.status === 409)) throw requestError;
      }
      setSwitching(null);
      toast({ title: "Ahora paga mensual", description: "La cuota del mes ya aparece en Pagos › Por cobrar.", tone: "success" });
      await load();
    } catch (requestError) {
      toast({ title: "No se pudo actualizar", description: apiMessage(requestError), tone: "error" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function scheduleTrial(trialStudentId: string, trialDate: string, onScheduled: () => void) {
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
      onScheduled();
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

  async function toggleStatus() {
    if (!danceClass) return;
    const nextActive = danceClass.status === "INACTIVE" || danceClass.status === "ARCHIVED";
    const approved = await confirm({
      title: nextActive ? "Reactivar clase" : "Inactivar clase",
      description: nextActive
        ? "La clase vuelve a aceptar inscripciones. Cargá sus horarios para que se generen clases."
        : "Desde hoy no se generan más clases y se cierran las inscripciones vigentes. Asistencias, pagos y deudas se conservan.",
      confirmLabel: nextActive ? "Reactivar" : "Inactivar",
      tone: nextActive ? "default" : "danger"
    });
    if (!approved) return;

    setBusy(true);
    try {
      await apiFetch("/admin/classes/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status: nextActive ? "ACTIVE" : "ARCHIVED" })
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
      description: `Se eliminará ${danceClass.name} de forma permanente. Solo se puede borrar si no tiene actividad registrada, como alumnos, cobros, pruebas o clases ya realizadas.`,
      confirmLabel: "Eliminar definitivamente",
      tone: "danger"
    });
    if (!approved) return;

    setBusy(true);
    try {
      await apiFetch<void>("/admin/classes/" + id, { method: "DELETE" });
      toast("Clase eliminada definitivamente");
      router.push("/admin/calendar");
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

  async function copyClassId() {
    if (!danceClass) return;
    try {
      await navigator.clipboard.writeText(danceClass._id);
      toast("ID de la clase copiado");
    } catch {
      toast({ title: "No se pudo copiar el ID", description: "Seleccioná el identificador para copiarlo manualmente.", tone: "error" });
    }
  }

  return {
    enroll,
    remove,
    changeBilling,
    switching,
    cancelSwitch: () => setSwitching(null),
    switchToMonthly,
    scheduleTrial,
    updateTrial,
    convertTrial,
    toggleStatus,
    deleteClass,
    setPublishOnWeb,
    copyClassId
  };
}
