import { Gift } from "lucide-react";
import type { Student } from "./live-types";
import type { TrialBooking } from "./class-detail-types";
import styles from "./class-detail.module.css";

type Props = {
  trials: TrialBooking[];
  availableStudents: Student[];
  trialStudentId: string;
  trialDate: string;
  busy: boolean;
  onStudentChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onSchedule: () => void;
  onUpdate: (trial: TrialBooking, status: "COMPLETED" | "CANCELLED") => void;
  onConvert: (trialId: string) => void;
};

export function ClassTrialsCard({
  trials,
  availableStudents,
  trialStudentId,
  trialDate,
  busy,
  onStudentChange,
  onDateChange,
  onSchedule,
  onUpdate,
  onConvert
}: Props) {
  return (
    <section className={styles.card + " " + styles.trialCard}>
      <div className={styles.cardHeader}><span>PRUEBA</span><h3>Clases de prueba</h3></div>
      <div className={styles.trialComposer}>
        <select value={trialStudentId} onChange={(event) => onStudentChange(event.target.value)}>
          <option value="">Seleccionar alumno</option>
          {availableStudents.map((student) => (
            <option value={student._id} key={student._id}>{student.firstName} {student.lastName}</option>
          ))}
        </select>
        <input type="date" value={trialDate} onChange={(event) => onDateChange(event.target.value)} />
        <button disabled={!trialStudentId || !trialDate || busy} onClick={onSchedule}>
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
                  <button onClick={() => onUpdate(trial, "COMPLETED")} disabled={busy}>Realizada</button>
                  <button onClick={() => onUpdate(trial, "CANCELLED")} disabled={busy}>Cancelar</button>
                </>
              )}
              {(trial.status === "SCHEDULED" || trial.status === "COMPLETED") && (
                <button className={styles.convertTrial} onClick={() => onConvert(trial._id)} disabled={busy}>Inscribir</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
