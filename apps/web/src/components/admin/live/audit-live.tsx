"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import type { Paginated } from "./live-types";
import { ErrorBlock, LoadingBlock } from "./live-common";
import styles from "./live.module.css";

type AuditItem = {
  _id: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  actorUserId?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
};

const actionLabels: Record<string, string> = {
  ADMIN_PROFILE_UPDATED: "Perfil administrador actualizado",
  ADMIN_PASSWORD_CHANGED: "Contraseña administrador cambiada",
  STUDENT_CREATED: "Alumno creado",
  STUDENT_UPDATED: "Alumno actualizado",
  PROFESSOR_CREATED: "Profesor creado",
  PROFESSOR_UPDATED: "Profesor actualizado",
  PROFESSOR_PASSWORD_RESET: "Contraseña profesor restablecida",
  CLASS_CREATED: "Clase creada",
  CLASS_UPDATED: "Clase actualizada",
  ENROLLMENT_CREATED: "Inscripción creada",
  ENROLLMENT_ENDED: "Inscripción finalizada",
  PAYMENT_CREATED: "Cuota creada",
  PAYMENT_UPDATED: "Pago actualizado",
  PAYMENT_MARKED_PAID: "Pago registrado",
  PAYMENT_CANCELLED: "Pago cancelado",
  EMAIL_CAMPAIGN_SENT: "Campaña de email enviada",
  EMAIL_RETRIED: "Email reintentado",
  WHATSAPP_OPENED: "WhatsApp abierto",
  BRANCH_CREATED: "Sede creada",
  BRANCH_UPDATED: "Sede actualizada",
  ORGANIZATION_SETTINGS_UPDATED: "Configuración de academia actualizada"
};

export function AuditLive() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search) params.set("q", search);
      if (entityType) params.set("entityType", entityType);

      const result = await apiFetch<Paginated<AuditItem>>(
        `/admin/audit?${params.toString()}`
      );
      setItems(result.items);
      setTotal(result.total);
    } catch (requestError) {
      setError(apiMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [search, entityType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <>
      <PageHeader
        eyebrow="TRAZABILIDAD"
        title="Auditoría"
        description="Historial de acciones sensibles realizadas dentro de la administración."
      />

      <div className={styles.notice}>
        <ClipboardList size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
        {total} acciones registradas. La auditoría es de solo lectura.
      </div>

      <div className={styles.filterBar}>
        <div className={styles.searchInline}>
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar acción o entidad..."
          />
        </div>
        <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
          <option value="">Todas las entidades</option>
          <option value="User">Usuarios</option>
          <option value="Student">Alumnos</option>
          <option value="Professor">Profesores</option>
          <option value="DanceClass">Clases</option>
          <option value="Enrollment">Inscripciones</option>
          <option value="Payment">Pagos</option>
          <option value="NotificationLog">Comunicaciones</option>
          <option value="Branch">Sedes</option>
          <option value="Organization">Academia</option>
        </select>
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}
      {loading && !items.length && <LoadingBlock label="Cargando auditoría..." />}

      {!loading && (
        <div className={styles.listCard}>
          {items.length === 0 && (
            <div className={styles.stateBlock}>No hay acciones para estos filtros.</div>
          )}
          {items.map((item) => (
            <div className={styles.listRow} key={item._id}>
              <span className={styles.avatar}>
                <ClipboardList size={16} />
              </span>
              <span className={styles.rowBody}>
                <strong>{actionLabels[item.action] ?? item.action}</strong>
                <small>
                  {item.actorUserId
                    ? `${item.actorUserId.firstName} ${item.actorUserId.lastName} · ${item.actorUserId.email}`
                    : "Usuario no disponible"}
                </small>
                <small>{new Date(item.createdAt).toLocaleString("es-AR")}</small>
              </span>
              <span className={styles.pillOff}>{item.entityType}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
