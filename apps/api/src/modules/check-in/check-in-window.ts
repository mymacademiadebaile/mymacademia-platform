import { academyInstant, academyNow } from "../../common/dates";
export function withinCheckInWindow(session: { sessionDate: string; startTime: string; endTime: string; status: string },
  settings: { beforeMinutes: number; afterMinutes: number }, now = new Date()) {
  if (!["SCHEDULED", "IN_PROGRESS"].includes(session.status) || session.sessionDate !== academyNow(now).date) return false;
  const start = academyInstant(session.sessionDate, session.startTime).getTime();
  const end = academyInstant(session.sessionDate, session.endTime).getTime();
  return now.getTime() >= start - settings.beforeMinutes * 60000 && now.getTime() <= Math.min(start + settings.afterMinutes * 60000, end);
}
