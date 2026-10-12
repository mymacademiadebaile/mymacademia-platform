import { CalendarDays, Plus, Trash2 } from "lucide-react";
import {
  billingPreferenceLabel,
  scheduleKey,
  scheduleLabel
} from "./student-detail-helpers";
import type { Enrollment } from "./student-detail-types";
import styles from "./student-detail-cards.module.css";

export function StudentEnrollmentsCard({
  enrollments,
  busy,
  onEnroll,
  onRemove
}: {
  enrollments: Enrollment[];
  busy: boolean;
  onEnroll: () => void;
  onRemove: (enrollment: Enrollment) => void;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div><span>CLASES</span><h3>Inscripciones</h3></div>
        <button onClick={onEnroll}><Plus size={15} /> Inscribir</button>
      </div>

      <div className={styles.itemList}>
        {enrollments.length === 0 && <p className={styles.empty}>No tiene clases activas.</p>}
        {enrollments.map((enrollment) => (
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
              onClick={() => onRemove(enrollment)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
