"use client";

import { LayoutGrid, List } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BILLING_MODE_LABEL, formatLongDate, groupLabel, priceLabel, scheduleDays } from "../format";
import type { ClassesData } from "../professor-types";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PageSkeleton,
  ProfessorPageHeader,
  SegmentedControl
} from "../professor-ui";
import { useProfessorData } from "../use-professor-data";
import { ProfessorClassCard } from "./professor-class-card";
import styles from "./professor-classes.module.css";

type ViewMode = "cards" | "list";
const STORAGE_KEY = "professor:classes:view";

export function ProfessorClasses() {
  const { data, error, loading, refreshing, reload } = useProfessorData<ClassesData>("/classes");
  const [view, setView] = useState<ViewMode>("cards");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "cards" || saved === "list") setView(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  if (loading) return <PageSkeleton blocks={3} />;

  const items = data?.items ?? [];

  return (
    <div>
      <ProfessorPageHeader
        title="Mis clases"
        subtitle="Las clases que tenés asignadas"
        refreshing={refreshing}
        actions={
          <SegmentedControl<ViewMode>
            label="Modo de vista"
            value={view}
            onChange={changeView}
            options={[
              { value: "cards", label: "Cards", icon: <LayoutGrid size={16} aria-hidden /> },
              { value: "list", label: "Lista", icon: <List size={16} aria-hidden /> }
            ]}
          />
        }
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {data && items.length === 0 && (
        <EmptyState
          title="Todavía no tenés clases asignadas."
          description="Cuando administración te asigne una clase, la vas a ver acá."
        />
      )}

      {items.length > 0 && view === "cards" && (
        <div className={styles.grid}>
          {items.map((item) => (
            <ProfessorClassCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {items.length > 0 && view === "list" && (
        <Card className={styles.listCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Clase</th>
                <th scope="col">Sede</th>
                <th scope="col">Horarios</th>
                <th scope="col">Alumnos</th>
                <th scope="col">Cobro</th>
                <th scope="col">Estado</th>
                <th scope="col">Próxima</th>
                <th scope="col">
                  <span className={styles.srOnly}>Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Clase">
                    <strong>{item.name}</strong>
                    <div className={styles.sub}>
                      {[groupLabel(item), ...item.disciplines.map((d) => d.name)].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td data-label="Sede">{item.branch.name}</td>
                  <td data-label="Horarios">
                    <div>
                      {scheduleDays(item.schedules)}
                      <div className={styles.sub}>
                        {item.schedules.map((slot) => `${slot.startTime} – ${slot.endTime}`).join(" · ")}
                      </div>
                    </div>
                  </td>
                  <td data-label="Alumnos">
                    {item.enrolledCount} / {item.capacity}
                  </td>
                  <td data-label="Cobro">
                    <div>
                      {BILLING_MODE_LABEL[item.billingMode]}
                      <div className={styles.sub}>{priceLabel(item)}</div>
                      {item.freeTrialEnabled && <Chip>Prueba gratis</Chip>}
                    </div>
                  </td>
                  <td data-label="Estado">{item.status === "ACTIVE" ? "Activa" : "Inactiva"}</td>
                  <td data-label="Próxima">
                    {item.nextOccurrence
                      ? `${formatLongDate(item.nextOccurrence.date)} ${item.nextOccurrence.startTime}`
                      : "Sin próximas"}
                  </td>
                  <td className={styles.actionCell}>
                    <Link href={`/professor/classes/${item.id}`} className={styles.link}>
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
