import type { FormEvent } from "react";
import type { BillingPreference, DanceClass } from "./live-types";
import { Field, LiveModal } from "./live-common";
import {
  availableMonthlyPlans,
  billingPreferenceLabel,
  classBillingMode,
  monthlyPlansAvailable,
  monthlyPriceFor,
  scheduleKey,
  scheduleLabel
} from "./student-detail-helpers";
import styles from "./student-detail-modals.module.css";

export function StudentEnrollModal({
  open,
  busy,
  availableClasses,
  selectedClass,
  selectedClassId,
  selectedBillingPreference,
  selectedMonthlyPlan,
  selectedScheduleKeys,
  onSelectClass,
  onBillingPreferenceChange,
  onMonthlyPlanChange,
  onScheduleKeysChange,
  onClose,
  onSubmit
}: {
  open: boolean;
  busy: boolean;
  availableClasses: DanceClass[];
  selectedClass?: DanceClass;
  selectedClassId: string;
  selectedBillingPreference: BillingPreference;
  selectedMonthlyPlan: 4 | 8;
  selectedScheduleKeys: string[];
  onSelectClass: (classId: string) => void;
  onBillingPreferenceChange: (preference: BillingPreference) => void;
  onMonthlyPlanChange: (plan: 4 | 8) => void;
  onScheduleKeysChange: (update: (current: string[]) => string[]) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <LiveModal
      open={open}
      title="Inscribir en una clase"
      description="Elegí la clase y, si admite ambas modalidades, cómo pagará actualmente el alumno."
      submitting={busy}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Inscribir alumno"
    >
      <Field label="Clase" wide>
        <select
          required
          value={selectedClassId}
          onChange={(event) => onSelectClass(event.target.value)}
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
              onBillingPreferenceChange(event.target.value as BillingPreference)
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
          <select value={selectedMonthlyPlan} onChange={(event) => onMonthlyPlanChange(Number(event.target.value) as 4 | 8)}>
            {availableMonthlyPlans(selectedClass).map((plan) => (
              <option key={plan} value={plan}>{plan} clases · {"$ " + monthlyPriceFor(selectedClass, plan).toLocaleString("es-AR")}</option>
            ))}
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
                    onChange={(event) => onScheduleKeysChange((current) =>
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
  );
}
