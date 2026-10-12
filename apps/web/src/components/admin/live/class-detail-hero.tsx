import { Copy, Power, Trash2 } from "lucide-react";
import type { DanceClass } from "./live-types";
import { billingLabel, refName } from "./class-detail-helpers";
import styles from "./class-detail.module.css";

type Props = {
  danceClass: DanceClass;
  busy: boolean;
  onCopyId: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
};

export function ClassDetailHero({ danceClass, busy, onCopyId, onEdit, onToggleStatus, onDelete }: Props) {
  return (
    <section className={styles.hero}>
      <div>
        <span className={danceClass.status === "ACTIVE" ? styles.active : styles.inactive}>
          {danceClass.status === "ACTIVE" ? "Clase activa" : danceClass.status === "PAUSED" ? "Clase en pausa" : "Clase inactiva"}
        </span>
        <div className={styles.classTitleRow}>
          <h2>{danceClass.name}</h2>
          <button className={styles.classId} type="button" onClick={onCopyId} title="Copiar ID de la clase" aria-label="Copiar ID de la clase">
            <span>ID</span>
            <code>{danceClass._id}</code>
            <Copy size={13} aria-hidden="true" />
          </button>
        </div>
        <p>{danceClass.professorIds.map(refName).join(", ")} · {billingLabel(danceClass)}{danceClass.freeTrialEnabled ? " · Prueba disponible" : ""}</p>
      </div>
      <div className={styles.heroActions}>
        <button onClick={onEdit}>Editar clase</button>
        <button className={styles.dangerAction} disabled={busy} onClick={onToggleStatus}>
          <Power size={15} /> {danceClass.status === "INACTIVE" || danceClass.status === "ARCHIVED" ? "Reactivar" : "Inactivar"}
        </button>
        <button className={styles.dangerAction} disabled={busy} onClick={onDelete}>
          <Trash2 size={15} /> Eliminar
        </button>
      </div>
    </section>
  );
}
