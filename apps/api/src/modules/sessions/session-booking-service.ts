import { academyNow, weekDayFor } from "../../common/dates";
import { AppError } from "../../common/http/app-error";

export function scheduleKey(slot: { day: string; startTime: string; endTime: string }) {
  return `${slot.day}:${slot.startTime}:${slot.endTime}`;
}

export function enrollmentMatchesSession(
  enrollment: { scheduleKeys?: string[] },
  session: { sessionDate: string; startTime: string; endTime: string }
) {
  // Legacy records predate slot selection and intentionally keep the old all-slots behaviour.
  if (!enrollment.scheduleKeys?.length) return true;
  return enrollment.scheduleKeys.includes(scheduleKey({
    day: weekDayFor(session.sessionDate), startTime: session.startTime, endTime: session.endTime
  }));
}

export function assertCancellationWindow(session: { sessionDate: string; startTime: string }, noticeHours: number) {
  const now = academyNow();
  const current = `${now.date}T${now.time}`;
  const starts = `${session.sessionDate}T${session.startTime}`;
  // Argentina's operating timezone is UTC-3. String comparison catches passed sessions; exact
  // elapsed hours handles the configurable notice interval.
  const startAt = new Date(`${starts}:00-03:00`).getTime();
  if (starts <= current || startAt - Date.now() < noticeHours * 60 * 60 * 1000) {
    throw new AppError(422, `La cancelación requiere ${noticeHours} h de anticipación`, "CANCELLATION_NOTICE_REQUIRED");
  }
}
