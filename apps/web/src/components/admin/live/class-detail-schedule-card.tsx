import { CalendarDays } from "lucide-react";
import type { DanceClass } from "./live-types";
import { dayLabels, refId, refName } from "./class-detail-helpers";
import styles from "./class-detail-schedule.module.css";
import common from "./class-detail-common.module.css";

export function ClassScheduleCard({ danceClass }: { danceClass: DanceClass }) {
  return (
    <section className={common.card}>
      <div className={common.cardHeader}><span>HORARIOS</span><h3>Agenda semanal</h3></div>
      <div className={styles.scheduleList}>
        {danceClass.schedules.map((schedule, index) => (
          <div key={index}>
            <CalendarDays size={16} />
            <strong>{dayLabels[schedule.day] ?? schedule.day}</strong>
            <span>{schedule.startTime}–{schedule.endTime}</span>
          </div>
        ))}
      </div>
      <div className={styles.tags}>
        {[...danceClass.disciplineIds, ...danceClass.segmentIds, ...danceClass.levelIds].map((item) => (
          <span key={refId(item)}>{refName(item)}</span>
        ))}
      </div>
    </section>
  );
}
