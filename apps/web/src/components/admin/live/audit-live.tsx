"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { AUDIT_ENTITY_LABELS, auditActionLabel, auditEntityLabel } from "@mym/shared";
import { PageHeader } from "../admin-ui";
import { apiFetch, apiMessage } from "@/lib/api";
import { formatInstant } from "@/lib/dates";
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
          {Object.entries(AUDIT_ENTITY_LABELS)
            .sort(([, left], [, right]) => left.localeCompare(right, "es"))
            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
                <strong>{auditActionLabel(item.action)}</strong>
                <small>
                  {item.actorUserId
                    ? `${item.actorUserId.firstName} ${item.actorUserId.lastName} · ${item.actorUserId.email}`
                    : "Usuario no disponible"}
                </small>
                <small>{formatInstant(item.createdAt)}</small>
              </span>
              <span className={styles.pillOff}>{auditEntityLabel(item.entityType)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
