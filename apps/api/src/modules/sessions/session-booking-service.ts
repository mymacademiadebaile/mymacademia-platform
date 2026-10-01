import { Types } from "mongoose";
import { academyNow, weekDayFor } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { SessionBookingModel } from "./session-booking.model";

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

export async function sessionEnrollmentIds(organizationId: string, session: any) {
  const [enrollments, overrides] = await Promise.all([
    EnrollmentModel.find({ organizationId, classId: session.classId, status: "ACTIVE" })
      .select("_id studentId scheduleKeys")
      .lean<any[]>(),
    SessionBookingModel.find({ organizationId, sessionId: session._id }).lean<any[]>()
  ]);
  const overrideByEnrollment = new Map(overrides.map((item) => [String(item.enrollmentId), item.status]));
  return enrollments.filter((enrollment) => {
    const override = overrideByEnrollment.get(String(enrollment._id));
    return override === "BOOKED" || (override !== "CANCELLED" && enrollmentMatchesSession(enrollment, session));
  });
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

export async function assertSessionCapacity(organizationId: string, session: any, capacity: number, excludingEnrollmentId?: unknown) {
  const enrolled = await sessionEnrollmentIds(organizationId, session);
  const occupied = excludingEnrollmentId
    ? enrolled.filter((item) => !item._id.equals(excludingEnrollmentId as Types.ObjectId)).length
    : enrolled.length;
  if (occupied >= capacity) {
    throw new AppError(409, "El turno no tiene cupo disponible", "SESSION_CAPACITY_REACHED");
  }
}

/** Capacity check for a recurring slot at enrollment time; date-specific transfers are checked separately. */
export async function assertScheduleCapacity(
  organizationId: string,
  classId: Types.ObjectId,
  schedule: { day: string; startTime: string; endTime: string },
  capacity: number,
  excludingEnrollmentId?: unknown
) {
  const enrollments = await EnrollmentModel.find({ organizationId, classId, status: "ACTIVE" })
    .select("_id scheduleKeys")
    .lean<any[]>();
  const key = scheduleKey(schedule);
  const occupied = enrollments.filter(
    (item) =>
      (!excludingEnrollmentId || !item._id.equals(excludingEnrollmentId as Types.ObjectId)) &&
      (!item.scheduleKeys?.length || item.scheduleKeys.includes(key))
  ).length;
  if (occupied >= capacity) {
    throw new AppError(409, "Uno de los horarios seleccionados no tiene cupo disponible", "SCHEDULE_CAPACITY_REACHED");
  }
}
