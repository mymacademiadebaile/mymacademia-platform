import { Plus } from "lucide-react";
import type { MidMonthPolicy } from "@mym/shared";
import type { BillingPreference, DanceClass, Student } from "./live-types";
import {
  availableMonthlyPlans,
  dayLabels,
  monthlyPlansAvailable,
  monthlyPlansLabel,
  monthlyPriceFor,
  normalizedMode,
  preferenceForClass,
  preferenceLabel
} from "./class-detail-helpers";
import styles from "./class-detail-enroll.module.css";
import common from "./class-detail-common.module.css";

type Props = {
  danceClass: DanceClass;
  availableStudents: Student[];
  busy: boolean;
  studentId: string;
  billingPreference: BillingPreference;
  monthlyPlan: 4 | 8;
  startDate: string;
  joinPolicy: "" | MidMonthPolicy;
  joinCustomAmount: string;
  selectedSeries: string[];
  onStudentChange: (value: string) => void;
  onBillingPreferenceChange: (value: BillingPreference) => void;
  onMonthlyPlanChange: (value: 4 | 8) => void;
  onStartDateChange: (value: string) => void;
  onJoinPolicyChange: (value: "" | MidMonthPolicy) => void;
  onJoinCustomAmountChange: (value: string) => void;
  onSelectedSeriesChange: (updater: (current: string[]) => string[]) => void;
  onEnroll: () => void;
};

export function ClassEnrollCard(props: Props) {
  const {
    danceClass, availableStudents, busy, studentId, billingPreference, monthlyPlan, startDate,
    joinPolicy, joinCustomAmount, selectedSeries
  } = props;
  const mode = normalizedMode(danceClass);
  const effectivePreference = mode === "BOTH" ? billingPreference : preferenceForClass(danceClass);
  const isMonthly = effectivePreference === "MONTHLY";
  const midMonthStart = isMonthly && startDate.slice(8, 10) !== "01";
  const slots = danceClass.scheduleOccupancy ?? [];
  let step = 0;
  const num = () => ++step;

  return (
    <section className={common.card}>
      <div className={common.cardHeader}><span>INSCRIPCIÓN</span><h3>Agregar alumno</h3></div>
      <div className={styles.enrollSteps}>
        <div className={styles.enrollStep}>
          <label className={styles.enrollLabel}><b>{num()}</b>Alumno</label>
          <select value={studentId} onChange={(event) => props.onStudentChange(event.target.value)}>
            <option value="">Seleccionar alumno de la sede</option>
            {availableStudents.map((student) => (
              <option value={student._id} key={student._id}>{student.firstName} {student.lastName}</option>
            ))}
          </select>
        </div>

        {mode === "BOTH" && (
          <div className={styles.enrollStep}>
            <label className={styles.enrollLabel}><b>{num()}</b>Cómo paga</label>
            <select value={billingPreference} onChange={(event) => props.onBillingPreferenceChange(event.target.value as BillingPreference)}>
              <option value="PER_CLASS">Por clase · {"$ " + (danceClass.pricePerClass ?? 0).toLocaleString("es-AR")}</option>
              <option value="MONTHLY">Mensual · {monthlyPlansLabel(danceClass)}</option>
            </select>
          </div>
        )}

        {isMonthly && monthlyPlansAvailable(danceClass) && (
          <div className={styles.enrollStep}>
            <label className={styles.enrollLabel}><b>{num()}</b>Plan mensual</label>
            <select value={monthlyPlan} onChange={(event) => props.onMonthlyPlanChange(Number(event.target.value) as 4 | 8)}>
              {availableMonthlyPlans(danceClass).map((plan) => (
                <option key={plan} value={plan}>Plan de {plan} clases · {"$ " + monthlyPriceFor(danceClass, plan).toLocaleString("es-AR")}</option>
              ))}
            </select>
          </div>
        )}

        {slots.length > 1 && (
          <div className={styles.enrollStep}>
            <label className={styles.enrollLabel}><b>{num()}</b>Días y horarios</label>
            <div className={styles.slotChips}>
              {slots.map((slot) => {
                const checked = selectedSeries.includes(slot.seriesId);
                const full = slot.occupied >= danceClass.capacity;
                return (
                  <label key={slot.seriesId} className={styles.slotChip + (checked ? " " + styles.slotChipOn : "")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        props.onSelectedSeriesChange((current) =>
                          event.target.checked ? [...current, slot.seriesId] : current.filter((item) => item !== slot.seriesId)
                        )
                      }
                    />
                    <strong>{dayLabels[slot.day] ?? slot.day} {slot.startTime}</strong>
                    <small className={full ? styles.slotFull : undefined}>{slot.occupied}/{danceClass.capacity} cupos{full ? " · lleno" : ""}</small>
                  </label>
                );
              })}
            </div>
            <p className={common.helper}>
              {selectedSeries.length === 0 ? "Sin selección: el alumno se inscribe en todos los horarios." : `${selectedSeries.length} de ${slots.length} horarios seleccionados.`}
            </p>
          </div>
        )}

        <div className={styles.enrollStep}>
          <label className={styles.enrollLabel}><b>{num()}</b>Fecha de inicio</label>
          <input type="date" aria-label="Fecha de inicio" value={startDate} onChange={(event) => props.onStartDateChange(event.target.value)} />
        </div>

        {midMonthStart && (
          <div className={styles.enrollStep}>
            <label className={styles.enrollLabel}><b>{num()}</b>Cobro del primer mes</label>
            <select value={joinPolicy} onChange={(event) => props.onJoinPolicyChange(event.target.value as "" | MidMonthPolicy)}>
              <option value="">Elegí cómo cobrar el primer mes</option>
              <option value="FULL">Cuota completa del mes</option>
              <option value="PRORATED">Proporcional a las clases que quedan</option>
              <option value="CUSTOM">Importe personalizado</option>
            </select>
            <p className={common.helper}>El alumno entra a mitad de mes, por eso hay que definir cuánto se cobra ahora.</p>
            {joinPolicy === "CUSTOM" && (
              <input type="number" min="0" step="0.01" placeholder="Importe a cobrar ($)" value={joinCustomAmount} onChange={(event) => props.onJoinCustomAmountChange(event.target.value)} />
            )}
          </div>
        )}

        <button className={styles.enrollSubmit} disabled={!studentId || busy || !["ACTIVE", "PAUSED"].includes(danceClass.status)} onClick={props.onEnroll}>
          <Plus size={15} /> Inscribir alumno
        </button>
        {mode !== "BOTH" && (
          <p className={common.helper}>
            Modalidad: {preferenceLabel(preferenceForClass(danceClass))}. La mensualidad no limita cuántas clases toma.
          </p>
        )}
      </div>
    </section>
  );
}
