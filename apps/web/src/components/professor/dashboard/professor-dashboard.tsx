"use client";

import { AlertTriangle, CalendarCheck, CalendarDays, Clock, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { addDaysKey, formatLongDate, formatTimeRange, groupLabel, PHASE_LABEL } from "../format";
import type { DashboardData, SessionItem } from "../professor-types";
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  PageSkeleton,
  ProfessorPageHeader,
  ProfessorStatCard,
  uiStyles
} from "../professor-ui";
import { ProfessorClassSessionCard } from "../session-card";
import { useProfessorData } from "../use-professor-data";
import styles from "./professor-dashboard.module.css";

function nextSessionWhen(session: SessionItem, today: string) {
  if (session.date === today) return `hoy a las ${session.startTime}`;
  if (session.date === addDaysKey(today, 1)) return `mañana a las ${session.startTime}`;
  return `el ${formatLongDate(session.date).toLowerCase()} a las ${session.startTime}`;
}

function NextClassHero({ session, today }: { session: SessionItem | null; today: string }) {
  if (!session) {
    return (
      <section className={styles.heroEmpty} aria-label="Próxima clase">
        <EmptyState
          icon={<CalendarDays size={24} />}
          title="No tenés clases próximas"
          description="Cuando se programen nuevas clases van a aparecer acá."
          action={
            <Link href="/professor/calendar" className={uiStyles.secondaryButton}>
              Ver calendario
            </Link>
          }
        />
      </section>
    );
  }

  const isToday = session.date === today;
  return (
    <section className={styles.hero} aria-label="Próxima clase">
      <div className={styles.heroMain}>
        <span className={styles.heroEyebrow}>PRÓXIMA CLASE</span>
        <div className={styles.heroTime}>
          <strong>{session.startTime}</strong>
          <span>{isToday ? "Hoy" : formatLongDate(session.date)}</span>
        </div>
        <h2>{session.class.name}</h2>
        <p className={styles.heroSub}>
          {[session.class.disciplines.map((item) => item.name).join(", "), groupLabel(session.class)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <dl className={styles.heroFacts}>
          <div>
            <dt>Sede</dt>
            <dd>{session.class.branch.name}</dd>
          </div>
          <div>
            <dt>Alumnos</dt>
            <dd>
              {session.enrolledCount}/{session.class.capacity}
            </dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{session.durationMinutes} min</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>{PHASE_LABEL[session.phase]}</dd>
          </div>
        </dl>
      </div>
      <Link href={`/professor/sessions/${session.id}`} className={styles.heroCta}>
        {isToday ? "Gestionar clase" : "Ver clase"}
      </Link>
    </section>
  );
}

function Agenda({ data }: { data: DashboardData }) {
  const sessions = [...data.todaySessions].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Card
      title="Agenda de hoy"
      action={
        <Link href="/professor/calendar" className={styles.cardLink}>
          Ver calendario
        </Link>
      }
    >
      {sessions.length ? (
        <ol className={styles.timeline} aria-label={`Clases de hoy, ${formatLongDate(data.today)}`}>
          {sessions.map((session) => (
            <li key={session.id} title={formatTimeRange(session.startTime, session.endTime)}>
              <ProfessorClassSessionCard session={session} />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={<CalendarCheck size={24} />}
          title="No tenés clases hoy."
          description={
            data.nextSession
              ? `Tu próxima clase es ${nextSessionWhen(data.nextSession, data.today)}.`
              : "No hay clases programadas próximamente."
          }
        />
      )}
    </Card>
  );
}

export function ProfessorDashboard() {
  const { data, error, loading, refreshing, reload } = useProfessorData<DashboardData>("/dashboard");

  if (loading) return <PageSkeleton blocks={4} />;
  if (!data) return <ErrorState message={error} onRetry={reload} />;

  const { stats, alerts, professor, nextSession, today } = data;

  return (
    <>
      <ProfessorPageHeader
        title={`Hola, ${professor.firstName}`}
        subtitle={formatLongDate(today)}
        refreshing={refreshing}
      />
      {error && <ErrorState message={error} onRetry={reload} />}

      <NextClassHero session={nextSession} today={today} />

      <div className={styles.grid}>
        <div className={styles.left}>
          <Agenda data={data} />
        </div>
        <aside className={styles.right} aria-label="Resumen">
          <div className={styles.stats}>
            <ProfessorStatCard
              icon={<CalendarDays size={18} />}
              value={stats.classesThisWeek}
              label="Clases esta semana"
              href="/professor/calendar"
            />
            <ProfessorStatCard
              icon={<Users size={18} />}
              value={stats.activeStudents}
              label="Alumnos activos"
              href="/professor/students"
            />
            <ProfessorStatCard
              icon={<Wallet size={18} />}
              value={stats.pendingPayments}
              label="Con pago pendiente"
              tone={stats.pendingPayments > 0 ? "warn" : "success"}
              href="/professor/students?payment=PENDING"
            />
            <ProfessorStatCard
              icon={<Clock size={18} />}
              value={nextSession ? nextSession.startTime : "—"}
              label="Próxima clase"
              hint={nextSession ? nextSessionWhen(nextSession, today) : "Sin clases próximas"}
            />
          </div>

          <Card title="Necesitan atención">
            {alerts.length ? (
              <ul className={styles.alerts}>
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <Link href={alert.href} className={styles.alert} data-tone={alert.tone}>
                      <AlertTriangle size={18} aria-hidden />
                      <span className={styles.alertText}>{alert.message}</span>
                      <span className={styles.alertGo} aria-hidden>
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.allGood}>Todo en orden. No hay nada pendiente por ahora.</p>
            )}
          </Card>

          {professor.specialties.length > 0 && (
            <Card title="Tus especialidades">
              <div className={styles.chips}>
                {professor.specialties.map((item) => (
                  <Chip key={item.id}>{item.name}</Chip>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
