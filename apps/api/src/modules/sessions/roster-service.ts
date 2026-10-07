import { Types, type ClientSession } from "mongoose";
import { academyDayBounds, academyNow, weekDayFor } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { enrollmentMatchesSeries, isEnrollmentValidOn } from "../enrollments/enrollment-validity";
import { ensureLocks, touchLocks } from "../scheduling/resource-lock.model";
import { StudentModel } from "../students/student.model";
import { TrialBookingModel } from "../trials/trial-booking.model";
import { ClassAttendanceModel, type AttendanceStatus, type ParticipantType } from "./class-attendance.model";
import { ClassSessionModel } from "./class-session.model";
import { SessionBookingModel } from "./session-booking.model";

export interface RosterSession {
  _id: Types.ObjectId;
  organizationId?: Types.ObjectId;
  classId: Types.ObjectId;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
  seriesId?: Types.ObjectId;
  rosterFrozenAt?: Date;
}

export interface RosterEntry {
  studentId: string;
  participantType: ParticipantType;
  enrollmentId?: string;
  trialId?: string;
  attendanceStatus: AttendanceStatus;
  /** True when the entry comes from a persisted row (frozen roster or explicit addition). */
  persisted: boolean;
}

/** Legacy weekly slot key of a session, to honour Enrollment.scheduleKeys of old documents. */
export function sessionLegacyKey(session: { sessionDate: string; startTime: string; endTime: string }) {
  return `${weekDayFor(session.sessionDate)}:${session.startTime}:${session.endTime}`;
}

/** A session whose end already passed in Argentina. */
export function sessionHasEnded(session: { sessionDate: string; endTime: string }, now = academyNow()) {
  return session.sessionDate < now.date || (session.sessionDate === now.date && session.endTime <= now.time);
}

/**
 * Participants derived from the enrollments valid on the session day, the booking overrides and
 * the trials of that day. Students who are inactive today are left out of upcoming sessions only.
 */
async function deriveRoster(organizationId: string, session: RosterSession, dbSession?: ClientSession) {
  const today = academyNow().date;
  const { start, end } = academyDayBounds(session.sessionDate);
  const [enrollments, overrides, trials] = await Promise.all([
    EnrollmentModel.find({ organizationId, classId: session.classId })
      .select("_id studentId status enrolledAt endedAt createdAt periods scheduleKeys seriesIds")
      .session(dbSession ?? null)
      .lean<any[]>(),
    SessionBookingModel.find({ organizationId, sessionId: session._id }).session(dbSession ?? null).lean<any[]>(),
    TrialBookingModel.find({
      organizationId,
      classId: session.classId,
      status: { $in: ["SCHEDULED", "COMPLETED"] },
      scheduledFor: { $gte: start, $lt: end }
    })
      .session(dbSession ?? null)
      .lean<any[]>()
  ]);

  const overrideByEnrollment = new Map(overrides.map((item) => [String(item.enrollmentId), item.status]));
  const legacySlotKey = sessionLegacyKey(session);
  const entries: RosterEntry[] = [];

  for (const enrollment of enrollments) {
    const override = overrideByEnrollment.get(String(enrollment._id));
    if (override === "CANCELLED") continue;
    const regular =
      isEnrollmentValidOn(enrollment, session.sessionDate) &&
      enrollmentMatchesSeries(enrollment, { seriesId: session.seriesId, legacySlotKey });
    if (override !== "BOOKED" && !regular) continue;
    entries.push({
      studentId: String(enrollment.studentId),
      participantType: "ENROLLMENT",
      enrollmentId: String(enrollment._id),
      attendanceStatus: "EXPECTED",
      persisted: false
    });
  }

  const enrolled = new Set(entries.map((item) => item.studentId));
  for (const trial of trials) {
    const studentId = String(trial.studentId);
    if (enrolled.has(studentId)) continue;
    entries.push({
      studentId,
      participantType: "TRIAL",
      trialId: String(trial._id),
      attendanceStatus: "EXPECTED",
      persisted: false
    });
  }

  if (session.sessionDate >= today && entries.length) {
    const active = new Set(
      (
        await StudentModel.find({
          organizationId,
          _id: { $in: entries.map((item) => new Types.ObjectId(item.studentId)) },
          isActive: true
        })
          .select("_id")
          .session(dbSession ?? null)
          .lean<any[]>()
      ).map((item) => String(item._id))
    );
    return entries.filter((item) => active.has(item.studentId));
  }

  return entries;
}

/**
 * The roster of a session. A frozen session answers only with its persisted rows; otherwise the
 * derived roster is merged with the rows recorded so far (attendance, explicit additions).
 */
export async function loadRoster(
  organizationId: string,
  session: RosterSession,
  options: { dbSession?: ClientSession } = {}
): Promise<RosterEntry[]> {
  const rows = await ClassAttendanceModel.find({ organizationId, sessionId: session._id, removedAt: { $exists: false } })
    .session(options.dbSession ?? null)
    .lean<any[]>();
  const fromRows: RosterEntry[] = rows.map((row) => ({
    studentId: String(row.studentId),
    participantType: row.participantType ?? "ENROLLMENT",
    enrollmentId: row.enrollmentId ? String(row.enrollmentId) : undefined,
    trialId: row.trialId ? String(row.trialId) : undefined,
    attendanceStatus: row.status,
    persisted: true
  }));

  if (session.rosterFrozenAt) return fromRows;

  const derived = await deriveRoster(organizationId, session, options.dbSession);
  const byStudent = new Map(derived.map((item) => [item.studentId, item]));
  for (const row of fromRows) {
    const existing = byStudent.get(row.studentId);
    byStudent.set(row.studentId, existing ? { ...existing, ...row, enrollmentId: row.enrollmentId ?? existing.enrollmentId } : row);
  }
  return [...byStudent.values()];
}

/**
 * Persists the current roster as participant rows and marks the session as frozen. From then on
 * dropping or adding enrollments never changes who was part of this session. Idempotent.
 */
export async function freezeRoster(organizationId: string, session: RosterSession, dbSession?: ClientSession) {
  if (session.rosterFrozenAt) return;
  const roster = await loadRoster(organizationId, session, { dbSession });
  const missing = roster.filter((item) => !item.persisted);
  if (missing.length) {
    await ClassAttendanceModel.bulkWrite(
      missing.map((item) => ({
        updateOne: {
          filter: { organizationId: new Types.ObjectId(organizationId), sessionId: session._id, studentId: new Types.ObjectId(item.studentId) },
          update: {
            $setOnInsert: {
              organizationId: new Types.ObjectId(organizationId),
              sessionId: session._id,
              studentId: new Types.ObjectId(item.studentId),
              status: "EXPECTED",
              participantType: item.participantType,
              ...(item.enrollmentId ? { enrollmentId: new Types.ObjectId(item.enrollmentId) } : {}),
              ...(item.trialId ? { trialId: new Types.ObjectId(item.trialId) } : {})
            }
          },
          upsert: true
        }
      })),
      { ordered: false, session: dbSession }
    ).catch((error: any) => {
      if (error?.code !== 11000 && !(error?.writeErrors ?? []).every((item: any) => item.code === 11000)) throw error;
    });
  }
  await ClassSessionModel.updateOne(
    { _id: session._id, rosterFrozenAt: { $exists: false } },
    { $set: { rosterFrozenAt: new Date() } },
    { session: dbSession }
  );
  session.rosterFrozenAt = new Date();
}

/** Freezes past sessions on read, so history stops depending on today's enrollments. */
export async function freezeIfEnded(organizationId: string, session: RosterSession) {
  if (!session.rosterFrozenAt && sessionHasEnded(session) && ["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(session.status)) {
    await freezeRoster(organizationId, session);
  }
}

/** Number of seats a session takes from its capacity (trials included). */
export async function occupiedSeats(organizationId: string, session: RosterSession, dbSession?: ClientSession) {
  return (await loadRoster(organizationId, session, { dbSession })).length;
}

/** Capacity lock of a session: every write that adds people to it bumps this lock. */
export function sessionLockKey(sessionId: unknown) {
  return `session:${String(sessionId)}`;
}

/**
 * Throws when the session has no free seat. Must run inside the same transaction that adds the
 * participant, after `touchLocks`, so two concurrent requests for the last seat cannot both pass.
 */
export async function assertSeatAvailable(
  organizationId: string,
  session: RosterSession,
  capacity: number,
  dbSession: ClientSession | undefined,
  excludingStudentId?: string
) {
  const roster = await loadRoster(organizationId, session, { dbSession });
  const occupied = roster.filter((item) => item.studentId !== excludingStudentId).length;
  if (occupied >= capacity) {
    throw new AppError(409, "La clase no tiene cupo disponible", "SESSION_CAPACITY_REACHED");
  }
}

export { ensureLocks, touchLocks };

export interface BatchRosterEntry {
  studentId: string;
  enrollmentId?: string;
  participantType: ParticipantType;
  attendanceStatus: AttendanceStatus;
}

/**
 * Rosters of many sessions with five queries in total (calendar, dashboards, summaries).
 * Same rules as loadRoster: frozen sessions answer with their rows; the others with enrollments
 * valid that day for the session's series, booking overrides, trials and explicit additions.
 */
export async function rosterBatch(organizationId: string, sessions: RosterSession[]) {
  const rosters = new Map<string, BatchRosterEntry[]>();
  if (!sessions.length) return rosters;
  const today = academyNow().date;
  const classIds = [...new Set(sessions.map((item) => String(item.classId)))].map((id) => new Types.ObjectId(id));
  const sessionIds = sessions.map((item) => item._id);
  const dates = sessions.map((item) => item.sessionDate).sort();
  const first = academyDayBounds(dates[0]).start;
  const last = academyDayBounds(dates[dates.length - 1]).end;

  const [enrollments, overrides, rows, trials] = await Promise.all([
    EnrollmentModel.find({ organizationId, classId: { $in: classIds } })
      .select("_id classId studentId status enrolledAt endedAt createdAt periods scheduleKeys seriesIds")
      .lean<any[]>(),
    SessionBookingModel.find({ organizationId, sessionId: { $in: sessionIds } }).select("sessionId enrollmentId status").lean<any[]>(),
    ClassAttendanceModel.find({ organizationId, sessionId: { $in: sessionIds }, removedAt: { $exists: false } })
      .select("sessionId studentId enrollmentId participantType status")
      .lean<any[]>(),
    TrialBookingModel.find({
      organizationId,
      classId: { $in: classIds },
      status: { $in: ["SCHEDULED", "COMPLETED"] },
      scheduledFor: { $gte: first, $lt: last }
    })
      .select("classId studentId scheduledFor")
      .lean<any[]>()
  ]);

  const inactive = new Set(
    (
      await StudentModel.find({
        organizationId,
        _id: { $in: [...new Set(enrollments.map((item) => String(item.studentId)))] },
        isActive: false
      })
        .select("_id")
        .lean<any[]>()
    ).map((item) => String(item._id))
  );

  const enrollmentsByClass = new Map<string, any[]>();
  for (const enrollment of enrollments) {
    const key = String(enrollment.classId);
    enrollmentsByClass.set(key, [...(enrollmentsByClass.get(key) ?? []), enrollment]);
  }
  const overridesBySession = new Map<string, Map<string, string>>();
  for (const item of overrides) {
    const key = String(item.sessionId);
    const map = overridesBySession.get(key) ?? new Map<string, string>();
    map.set(String(item.enrollmentId), item.status);
    overridesBySession.set(key, map);
  }
  const rowsBySession = new Map<string, any[]>();
  for (const row of rows) {
    const key = String(row.sessionId);
    rowsBySession.set(key, [...(rowsBySession.get(key) ?? []), row]);
  }

  for (const session of sessions) {
    const entries = new Map<string, BatchRosterEntry>();
    for (const row of rowsBySession.get(String(session._id)) ?? []) {
      entries.set(String(row.studentId), {
        studentId: String(row.studentId),
        enrollmentId: row.enrollmentId ? String(row.enrollmentId) : undefined,
        participantType: row.participantType ?? "ENROLLMENT",
        attendanceStatus: row.status
      });
    }
    if (!session.rosterFrozenAt) {
      const sessionOverrides = overridesBySession.get(String(session._id)) ?? new Map<string, string>();
      const legacySlotKey = sessionLegacyKey(session);
      for (const enrollment of enrollmentsByClass.get(String(session.classId)) ?? []) {
        const override = sessionOverrides.get(String(enrollment._id));
        if (override === "CANCELLED") continue;
        const regular =
          isEnrollmentValidOn(enrollment, session.sessionDate) &&
          enrollmentMatchesSeries(enrollment, { seriesId: session.seriesId, legacySlotKey });
        if (override !== "BOOKED" && !regular) continue;
        if (session.sessionDate >= today && inactive.has(String(enrollment.studentId))) continue;
        const studentId = String(enrollment.studentId);
        const existing = entries.get(studentId);
        entries.set(studentId, {
          studentId,
          enrollmentId: existing?.enrollmentId ?? String(enrollment._id),
          participantType: existing?.participantType ?? "ENROLLMENT",
          attendanceStatus: existing?.attendanceStatus ?? "EXPECTED"
        });
      }
      const { start, end } = academyDayBounds(session.sessionDate);
      for (const trial of trials) {
        if (String(trial.classId) !== String(session.classId)) continue;
        if (trial.scheduledFor < start || trial.scheduledFor >= end) continue;
        const studentId = String(trial.studentId);
        if (!entries.has(studentId)) {
          entries.set(studentId, { studentId, participantType: "TRIAL", attendanceStatus: "EXPECTED" });
        }
      }
    }
    rosters.set(String(session._id), [...entries.values()]);
  }
  return rosters;
}

/** Participant counts of many sessions (calendar and list views). */
export async function rosterCounts(organizationId: string, sessions: RosterSession[]) {
  const rosters = await rosterBatch(organizationId, sessions);
  return new Map([...rosters.entries()].map(([id, entries]) => [id, entries.length]));
}
