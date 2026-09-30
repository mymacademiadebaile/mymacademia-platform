"use client";

import { Check, ClipboardCheck, Users, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { apiFetch, apiMessage } from "@/lib/api";
import { useAdminFeedback } from "@/components/ui/admin-feedback";
import { formatLongDate, formatTimeRange, groupLabel } from "../format";
import type { AttendanceStatus, SessionDetail } from "../professor-types";
import {
  Card,
  ErrorState,
  PageSkeleton,
  ProfessorStatCard,
  SessionPhaseBadge
} from "../professor-ui";
import { invalidateProfessorData, useProfessorData } from "../use-professor-data";
import { SessionRoster } from "./session-roster";
import styles from "./session-detail.module.css";

function withAttendance(
  current: SessionDetail,
  studentId: string,
  status: AttendanceStatus
): SessionDetail {
  const roster = current.roster.map((item) =>
    item.studentId === studentId ? { ...item, attendanceStatus: status } : item
  );
  return {
    ...current,
    roster,
    summary: {
      ...current.summary,
      present: roster.filter((item) => item.attendanceStatus === "PRESENT").length,
      absent: roster.filter((item) => item.attendanceStatus === "ABSENT").length
    }
  };
}

export function ProfessorSessionDetail({ sessionId }: { sessionId: string }) {
  const { data, error, loading, refreshing, reload, mutate } = useProfessorData<SessionDetail>(
    `/sessions/${sessionId}`
  );
  const { toast } = useAdminFeedback();

  const setAttendance = useCallback(
    async (studentId: string, status: "PRESENT" | "ABSENT") => {
      const previous = data?.roster.find((item) => item.studentId === studentId)?.attendanceStatus;
      if (!previous || previous === status) return;

      mutate((current) => withAttendance(current, studentId, status));
      try {
        await apiFetch(`/professor/sessions/${sessionId}/attendance/${studentId}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });
        toast({ title: "Asistencia actualizada", tone: "success" });
        invalidateProfessorData("/dashboard");
        invalidateProfessorData("/students");
        invalidateProfessorData("/classes/");
      } catch (requestError) {
        mutate((current) => withAttendance(current, studentId, previous));
        toast({
          title: "No pudimos guardar la asistencia",
          description: apiMessage(requestError),
          tone: "error"
        });
      }
    },
    [data, mutate, sessionId, toast]
  );

  if (loading) return <PageSkeleton blocks={4} />;
  if (!data) return <ErrorState message={error} onRetry={reload} />;

  const cancelled = data.phase === "CANCELLED";
  const group = groupLabel(data.class);

  return (
    <>
      <header className={styles.header}>
        <BackLink />
        <div className={styles.headerTop}>
          <h1 className={cancelled ? styles.cancelled : undefined}>{data.class.name}</h1>
          <SessionPhaseBadge phase={data.phase} longLabel />
          {refreshing && <span className={styles.refreshing}>Actualizando…</span>}
        </div>
        <p className={styles.date}>
          {formatLongDate(data.date)} · {formatTimeRange(data.startTime, data.endTime)}
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>Sede</dt>
            <dd>{data.class.branch.name}</dd>
          </div>
          {group && (
            <div>
              <dt>Público y nivel</dt>
              <dd>{group}</dd>
            </div>
          )}
          <div>
            <dt>Profesor</dt>
            <dd>{data.professor.displayName}</dd>
          </div>
          <div>
            <dt>Alumnos</dt>
            <dd>
              {data.enrolledCount} / {data.class.capacity} alumnos
            </dd>
          </div>
        </dl>
      </header>

      <div className={styles.stats}>
        <ProfessorStatCard icon={<Users size={18} />} value={data.summary.students} label="Alumnos" />
        <ProfessorStatCard
          icon={<Wallet size={18} />}
          value={data.summary.paid}
          label="Pagaron"
          tone="success"
        />
        <ProfessorStatCard
          icon={<Wallet size={18} />}
          value={data.summary.pending}
          label="Pendientes"
          tone={data.summary.pending > 0 ? "warn" : "default"}
        />
        <ProfessorStatCard
          icon={<Check size={18} />}
          value={data.summary.present}
          label="Presentes"
          tone="success"
        />
        <ProfessorStatCard icon={<X size={18} />} value={data.summary.absent} label="Ausentes" />
      </div>

      <Card title="Alumnos y asistencia" action={<ClipboardCheck size={20} aria-hidden />}>
        <SessionRoster roster={data.roster} disabled={cancelled} onAttendance={setAttendance} />
      </Card>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/professor/calendar" className={styles.back}>
      ← Volver al calendario
    </Link>
  );
}
