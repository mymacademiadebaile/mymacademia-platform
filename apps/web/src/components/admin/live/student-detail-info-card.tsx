import { formatDateOnly } from "@/lib/dates";
import type { Branch, Student } from "./live-types";
import styles from "./student-detail.module.css";

export function StudentInfoCard({ student, branches }: { student: Student; branches: Branch[] }) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div><span>DATOS</span><h3>Información personal</h3></div>
      </div>
      <dl className={styles.detailList}>
        <div><dt>Sede</dt><dd>{branches.find((branch) => branch._id === student.branchId)?.name ?? "—"}</dd></div>
        <div><dt>Email</dt><dd>{student.email || "—"}</dd></div>
        <div><dt>Teléfono</dt><dd>{student.phone || "—"}</dd></div>
        <div><dt>Nacimiento</dt><dd>{formatDateOnly(student.birthDate)}</dd></div>
        <div><dt>Responsable</dt><dd>{student.guardianName || "—"}</dd></div>
        <div><dt>Tel. responsable</dt><dd>{student.guardianPhone || "—"}</dd></div>
        <div className={styles.notes}><dt>Notas</dt><dd>{student.notes || "Sin notas"}</dd></div>
      </dl>
    </section>
  );
}
