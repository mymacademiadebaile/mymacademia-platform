import { Mail, MessageCircle, Power } from "lucide-react";
import { whatsappHref } from "./student-detail-helpers";
import type { StudentDetail } from "./student-detail-types";
import styles from "./student-detail.module.css";

export function StudentDetailHero({
  student,
  financial,
  activeCount,
  busy,
  onEdit,
  onToggleActive
}: {
  student: StudentDetail["student"];
  financial: StudentDetail["financial"];
  activeCount: number;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const fullName = `${student.firstName} ${student.lastName}`;

  return (
    <>
      <section className={styles.hero}>
        <span className={styles.avatar}>{student.firstName[0]}{student.lastName[0]}</span>
        <div className={styles.heroText}>
          <span className={student.isActive ? styles.active : styles.inactive}>
            {student.isActive ? "Alumno activo" : "Alumno inactivo"}
          </span>
          <h2>{fullName}</h2>
          <p>{student.phone || student.email || "Sin contacto cargado"}</p>
        </div>
        <div className={styles.heroActions}>
          {student.email && (
            <a href={`mailto:${student.email}`}><Mail size={16} /> Email</a>
          )}
          {student.phone && (
            <a href={whatsappHref(student.phone, student.firstName)} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}
          <button onClick={onEdit}>Editar</button>
          <button className={styles.dangerAction} disabled={busy} onClick={onToggleActive}>
            <Power size={16} /> {student.isActive ? "Inactivar" : "Reactivar"}
          </button>
        </div>
      </section>

      <div className={styles.financialGrid}>
        <article><span>Cobrado</span><strong>$ {financial.paidAmount.toLocaleString("es-AR")}</strong><small>{financial.paidCount} pagos</small></article>
        <article><span>Pendiente</span><strong>$ {financial.pendingAmount.toLocaleString("es-AR")}</strong><small>{financial.pendingCount} pagos</small></article>
        <article data-tone="danger"><span>Vencido</span><strong>$ {financial.overdueAmount.toLocaleString("es-AR")}</strong><small>{financial.overdueCount} pagos</small></article>
        <article><span>Clases activas</span><strong>{activeCount}</strong><small>inscripciones actuales</small></article>
      </div>
    </>
  );
}
