"use client";

import { ArrowLeft, Clock3, Plus, UsersRound } from "lucide-react";
import type { MidMonthPolicy } from "@mym/shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { todayInArgentina } from "@/lib/dates";
import type {
  BillingPreference,
  Branch,
  CatalogItem,
  DanceClass,
  Paginated,
  Professor,
  Student
} from "./live-types";
import { ErrorBlock, fetchAllPaginated, LoadingBlock, WebSwitch } from "./live-common";
import { GroupSchedulesPanel } from "../scheduling/group-schedules-panel";
import type { EnrollmentResponse, TrialBooking, TrialResponse } from "./class-detail-types";
import { defaultMonthlyPlan, preferenceForClass } from "./class-detail-helpers";
import { useClassActions } from "./class-detail-actions";
import { useClassCharge } from "./class-detail-charge";
import { useClassEdit } from "./class-detail-edit";
import { ClassDetailHero } from "./class-detail-hero";
import { ClassScheduleCard } from "./class-detail-schedule-card";
import { ClassEnrollCard } from "./class-detail-enroll-card";
import { ClassTrialsCard } from "./class-detail-trials-card";
import { ClassStudentsCard } from "./class-detail-students-card";
import { ClassChargeModal } from "./class-detail-charge-modal";
import { ClassEditModal } from "./class-detail-edit-modal";
import { FirstMonthModal } from "../billing/first-month-modal";
import styles from "./class-detail-layout.module.css";

export function ClassDetailLive({ id }: { id: string }) {
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
  const [monthlyPlan, setMonthlyPlan] = useState<4 | 8>(4);
  const [startDate, setStartDate] = useState(todayInArgentina());
  const [joinPolicy, setJoinPolicy] = useState<"" | MidMonthPolicy>("");
  const [joinCustomAmount, setJoinCustomAmount] = useState("");
  const [selectedSeries, setSelectedSeries] = useState<string[]>([]);
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
        fetchAllPaginated<Professor>("/admin/professors"),
        apiFetch<CatalogItem[]>("/admin/catalogs")
      ]);
      setDanceClass(classData);
      setEnrollments(enrollmentData);
      setTrials(trialData.items);
      setStudents(studentData.items);
      setBranches(branchList.filter((item) => item.isActive));
      setProfessors(professorList);
      setCatalogs(catalogList);
      setBillingPreference(preferenceForClass(classData) ?? "PER_CLASS");
      setMonthlyPlan(defaultMonthlyPlan(classData));
    } catch (requestError) {
      setError(apiMessage(requestError));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const actions = useClassActions({ id, danceClass, load, setBusy, setError });
  const charge = useClassCharge(danceClass);
  const edit = useClassEdit({ id, danceClass, load, setBusy, setError });

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

  if (!danceClass || !enrollments) {
    return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;
  }

  return (
    <>
      <Link href="/admin/calendar" className={styles.back}><ArrowLeft size={15} /> Volver al calendario</Link>

      <PageHeader
        eyebrow="GESTIÓN DE CLASE"
        title={danceClass.name}
        description="Horarios, profesores, precios, pruebas, cupo y alumnos inscriptos."
      />

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      <ClassDetailHero
        danceClass={danceClass}
        busy={busy}
        onCopyId={() => void actions.copyClassId()}
        onEdit={edit.openEdit}
        onToggleStatus={() => void actions.toggleStatus()}
        onDelete={() => void actions.deleteClass()}
      />

      <GroupSchedulesPanel classId={id} danceClass={danceClass} professors={professors.filter((item) => item.isActive)} onChanged={() => void load()} />

      <div className={styles.webToggle}>
        <WebSwitch
          label="Mostrar en la web"
          checked={danceClass.publishOnWeb !== false}
          busy={busy}
          describedBy="class-web-help"
          onChange={(next) => void actions.setPublishOnWeb(next)}
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
        <ClassScheduleCard danceClass={danceClass} />

        <ClassEnrollCard
          danceClass={danceClass}
          availableStudents={availableStudents}
          busy={busy}
          studentId={studentId}
          billingPreference={billingPreference}
          monthlyPlan={monthlyPlan}
          startDate={startDate}
          joinPolicy={joinPolicy}
          joinCustomAmount={joinCustomAmount}
          selectedSeries={selectedSeries}
          onStudentChange={setStudentId}
          onBillingPreferenceChange={setBillingPreference}
          onMonthlyPlanChange={setMonthlyPlan}
          onStartDateChange={setStartDate}
          onJoinPolicyChange={setJoinPolicy}
          onJoinCustomAmountChange={setJoinCustomAmount}
          onSelectedSeriesChange={setSelectedSeries}
          onEnroll={() =>
            void actions.enroll(
              { studentId, billingPreference, monthlyPlan, startDate, joinPolicy, joinCustomAmount, selectedSeries },
              () => {
                setStudentId("");
                setMonthlyPlan(defaultMonthlyPlan(danceClass));
                setJoinPolicy("");
                setJoinCustomAmount("");
              }
            )
          }
        />

        {danceClass.freeTrialEnabled && (
          <ClassTrialsCard
            trials={trials}
            availableStudents={availableTrialStudents}
            trialStudentId={trialStudentId}
            trialDate={trialDate}
            busy={busy}
            onStudentChange={setTrialStudentId}
            onDateChange={setTrialDate}
            onSchedule={() =>
              void actions.scheduleTrial(trialStudentId, trialDate, () => {
                setTrialStudentId("");
                setTrialDate("");
              })
            }
            onUpdate={(trial, status) => void actions.updateTrial(trial, status)}
            onConvert={(trialId) => void actions.convertTrial(trialId)}
          />
        )}

        <ClassStudentsCard
          danceClass={danceClass}
          enrollments={enrollments.items}
          busy={busy}
          onChangeBilling={(enrollment, next) => void actions.changeBilling(enrollment, next)}
          onChangeMonthlyPlan={(enrollment, next) => void actions.changeMonthlyPlan(enrollment, next)}
          onCharge={charge.openCharge}
          onRemove={(enrollment) => void actions.remove(enrollment)}
        />
      </div>

      <FirstMonthModal
        target={actions.switching}
        busy={busy}
        title={actions.switching?.midMonth ? "Pasar a mensual: primer mes" : "Pasar a mensual"}
        submitLabel="Pasar a mensual"
        askPolicy={actions.switching?.midMonth ?? true}
        onClose={actions.cancelSwitch}
        onSubmit={(choice) => void actions.switchToMonthly(choice)}
      />

      <ClassChargeModal
        danceClass={danceClass}
        chargingEnrollment={charge.chargingEnrollment}
        chargePaymentType={charge.chargePaymentType}
        chargeAmount={charge.chargeAmount}
        chargeSubmitting={charge.chargeSubmitting}
        onPaymentTypeChange={charge.changeChargePaymentType}
        onAmountChange={charge.setChargeAmount}
        onClose={() => charge.setChargingEnrollment(null)}
        onSubmit={charge.registerCharge}
      />

      <ClassEditModal
        open={edit.editing}
        danceClass={danceClass}
        branches={branches}
        professors={professors}
        catalogs={catalogs}
        busy={busy}
        editBillingMode={edit.editBillingMode}
        editSchedules={edit.editSchedules}
        onBillingModeChange={edit.setEditBillingMode}
        onSchedulesChange={edit.setEditSchedules}
        onUpdateSchedule={edit.updateSchedule}
        onClose={() => edit.setEditing(false)}
        onSubmit={edit.saveClass}
      />
    </>
  );
}
