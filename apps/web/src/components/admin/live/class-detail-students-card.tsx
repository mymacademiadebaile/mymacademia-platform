import { CircleDollarSign, Trash2 } from "lucide-react";
import Link from "next/link";
import type { BillingPreference, DanceClass } from "./live-types";
import type { Enrollment } from "./class-detail-types";
import { availableMonthlyPlans, defaultMonthlyPlan, monthlyPriceFor, normalizedMode, preferenceForClass, preferenceLabel } from "./class-detail-helpers";
import styles from "./class-detail-students.module.css";
import common from "./class-detail-common.module.css";

type Props = {
  danceClass: DanceClass;
  enrollments: Enrollment[];
  busy: boolean;
  onChangeBilling: (enrollment: Enrollment, next: BillingPreference) => void;
  onChangeMonthlyPlan: (enrollment: Enrollment, next: 4 | 8) => void;
  onCharge: (enrollment: Enrollment) => void;
  onRemove: (enrollment: Enrollment) => void;
};

export function ClassStudentsCard({ danceClass, enrollments, busy, onChangeBilling, onChangeMonthlyPlan, onCharge, onRemove }: Props) {
  const mode = normalizedMode(danceClass);
  const plans = availableMonthlyPlans(danceClass);

  return (
    <section className={common.card + " " + styles.studentsCard}>
      <div className={common.cardHeader}><span>ALUMNOS</span><h3>Inscriptos actuales</h3></div>
      <div className={styles.studentList}>
        {enrollments.length === 0 && <p className={common.helper}>Todavía no hay alumnos inscriptos.</p>}
        {enrollments.map((enrollment) => (
          <div key={enrollment._id}>
            <Link href={"/admin/students/" + enrollment.studentId._id} className={styles.studentIdentity}>
              <span>{enrollment.studentId.firstName[0]}{enrollment.studentId.lastName[0]}</span>
              <span>
                <strong>{enrollment.studentId.firstName} {enrollment.studentId.lastName}</strong>
                <small>{preferenceLabel(enrollment.billingPreference ?? preferenceForClass(danceClass))}{(enrollment.billingPreference ?? preferenceForClass(danceClass)) === "MONTHLY" && plans.length ? " · " + (enrollment.monthlyPlan ?? defaultMonthlyPlan(danceClass)) + " clases" : ""} · {enrollment.studentId.phone || enrollment.studentId.email || "Sin contacto"}</small>
              </span>
            </Link>
            {mode === "BOTH" && (
              <select
                value={enrollment.billingPreference ?? "PER_CLASS"}
                disabled={busy}
                onChange={(event) => onChangeBilling(enrollment, event.target.value as BillingPreference)}
              >
                <option value="PER_CLASS">Por clase</option>
                <option value="MONTHLY">Mensual</option>
              </select>
            )}
            {(enrollment.billingPreference ?? preferenceForClass(danceClass)) === "MONTHLY" && plans.length > 1 && (
              <label className={styles.monthlyPlanChoice}>
                <span>Plan mensual</span>
                <select
                  value={enrollment.monthlyPlan ?? defaultMonthlyPlan(danceClass)}
                  disabled={busy}
                  onChange={(event) => onChangeMonthlyPlan(enrollment, Number(event.target.value) as 4 | 8)}
                >
                  {plans.map((plan) => (
                    <option key={plan} value={plan}>{plan} clases · $ {monthlyPriceFor(danceClass, plan).toLocaleString("es-AR")}</option>
                  ))}
                </select>
              </label>
            )}
            <div className={styles.studentActions}>
              {mode !== "FREE" && (
                <button className={styles.chargeAction} title="Registrar cobro" disabled={busy} onClick={() => onCharge(enrollment)}>
                  <CircleDollarSign size={14} /> Cobrar
                </button>
              )}
              <button title="Dar de baja" disabled={busy} onClick={() => onRemove(enrollment)}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
