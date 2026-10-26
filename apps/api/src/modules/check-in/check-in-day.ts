import { academyNow } from "../../common/dates";

export function isCheckInDay(session: { sessionDate: string; status: string }, now = new Date()) {
  return ["SCHEDULED", "IN_PROGRESS"].includes(session.status) && session.sessionDate === academyNow(now).date;
}
