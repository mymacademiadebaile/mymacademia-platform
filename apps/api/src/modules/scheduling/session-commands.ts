import type { SessionStatus } from "@mym/shared";
import { Types, type ClientSession } from "mongoose";
import { academyNow, isCalendarDate } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { DanceClassModel, isArchivedStatus } from "../classes/class.model";
import { NotificationLogModel } from "../notifications/notification-log.model";
import { ProfessorModel } from "../professors/professor.model";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel, holdsSlot, slotKeyOf } from "../sessions/class-session.model";
import {
  assertSeatAvailable,
  freezeRoster,
  loadRoster,
  sessionHasEnded,
  sessionLockKey
} from "../sessions/roster-service";
import { StudentModel } from "../students/student.model";
import {
  assertNoConflicts,
  assertUsableSpace,
  calendarLockKey,
  findSessionConflicts
} from "./conflict-service";
import { ensureLocks, touchLocks } from "./resource-lock.model";
import { assertValidSlot, normalizedProfessorIds } from "./schedule-service";
import { assertTransition, statusChange } from "./session-state";

export interface Actor {
  organizationId: string;
  userId: string;
}

type SessionDoc = Awaited<ReturnType<typeof loadSessionForUpdate>>;

async function loadSessionForUpdate(organizationId: string, sessionId: string, dbSession?: ClientSession) {
  const session = await ClassSessionModel.findOne({ _id: sessionId, organizationId }).session(dbSession ?? null);
  if (!session) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId })
    .session(dbSession ?? null)
    .lean<any>();
  if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
  return { session, danceClass };
}

async function audit(actor: Actor, action: string, entityId: Types.ObjectId, metadata: Record<string, unknown>, dbSession?: ClientSession) {
  await AuditLogModel.create(
    [{ organizationId: actor.organizationId, actorUserId: actor.userId, action, entityType: "ClassSession", entityId, metadata }],
    { session: dbSession }
  );
}

function teachingProfessors(session: { professorIds?: Types.ObjectId[] }, danceClass: { professorIds?: Types.ObjectId[] }) {
  return session.professorIds?.length ? session.professorIds : danceClass.professorIds ?? [];
}

/** Turns the unique slot index into a readable 409. */
function rethrowSlotTaken(error: unknown): never {
  if ((error as { code?: number })?.code === 11000) {
    throw new AppError(409, "La clase ya tiene otra sesión en ese horario", "SESSION_SLOT_TAKEN");
  }
  throw error;
}

/**
 * Changes the status of a session through the state machine, recording who, when and why.
 * Completing freezes the roster; leaving an active state releases the time slot.
 */
export async function changeSessionStatus(actor: Actor, sessionId: string, to: SessionStatus, reason?: string) {
  const preview = await ClassSessionModel.findOne({ _id: sessionId, organizationId: actor.organizationId }).lean<any>();
  if (!preview) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  await ensureLocks(actor.organizationId, [calendarLockKey(preview.sessionDate), sessionLockKey(sessionId)]);

  return withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [calendarLockKey(preview.sessionDate), sessionLockKey(sessionId)], dbSession);
    const { session, danceClass } = await loadSessionForUpdate(actor.organizationId, sessionId, dbSession);
    const from = session.status as SessionStatus;
    assertTransition(from, to, reason);

    if (to === "SCHEDULED") {
      // Restoring a suspended session: it must still fit the calendar.
      assertNoConflicts(
        await findSessionConflicts(
          actor.organizationId,
          {
            date: session.sessionDate,
            startTime: session.startTime,
            endTime: session.endTime,
            spaceId: session.spaceId,
            professorIds: teachingProfessors(session, danceClass),
            excludeSessionIds: [session._id]
          },
          dbSession
        )
      );
    }

    if (to === "COMPLETED") {
      await freezeRoster(actor.organizationId, session, dbSession);
      session.completedAt = new Date();
    }

    session.status = to;
    session.statusReason = reason?.trim() || undefined;
    session.statusHistory.push(statusChange(from, to, reason, actor.userId) as never);
    session.slotKey = holdsSlot(to) ? slotKeyOf(session) : undefined;
    await session.save({ session: dbSession }).catch(rethrowSlotTaken);

    await audit(actor, `CLASS_SESSION_${to}`, session._id, {
      classId: session.classId,
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      from,
      to,
      reason
    }, dbSession);

    return session;
  });
}

/** Reopens a completed session (for example to fix a mistake). Always audited with a reason. */
export async function reopenSession(actor: Actor, sessionId: string, reason: string) {
  if (!reason?.trim()) throw new AppError(422, "Indicá el motivo del cambio", "SESSION_REASON_REQUIRED");
  return withTransaction(async (dbSession) => {
    const { session } = await loadSessionForUpdate(actor.organizationId, sessionId, dbSession);
    if (session.status !== "COMPLETED") {
      throw new AppError(409, "Sólo una clase realizada puede reabrirse", "INVALID_SESSION_TRANSITION");
    }
    session.status = "SCHEDULED";
    session.completedAt = undefined;
    session.statusReason = reason.trim();
    session.statusHistory.push(statusChange("COMPLETED", "SCHEDULED", reason, actor.userId) as never);
    session.slotKey = slotKeyOf(session);
    await session.save({ session: dbSession }).catch(rethrowSlotTaken);
    await audit(actor, "CLASS_SESSION_REOPENED", session._id, { reason }, dbSession);
    return session;
  });
}

export interface SessionChanges {
  startTime?: string;
  endTime?: string;
  spaceId?: string | null;
  professorIds?: string[];
  notes?: string;
  reason?: string;
}

/**
 * "Only this session": changes time, space or professors of one session without touching its
 * identity, roster, attendance or charges. Later schedule changes leave it alone.
 */
export async function updateSingleSession(actor: Actor, sessionId: string, changes: SessionChanges) {
  const preview = await ClassSessionModel.findOne({ _id: sessionId, organizationId: actor.organizationId }).lean<any>();
  if (!preview) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  await ensureLocks(actor.organizationId, [calendarLockKey(preview.sessionDate)]);

  return withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [calendarLockKey(preview.sessionDate)], dbSession);
    const { session, danceClass } = await loadSessionForUpdate(actor.organizationId, sessionId, dbSession);
    if (!["SCHEDULED", "SUSPENDED", "IN_PROGRESS"].includes(session.status)) {
      throw new AppError(409, "Sólo se pueden modificar clases que todavía no se realizaron", "SESSION_NOT_EDITABLE");
    }

    const timeChanged = changes.startTime !== undefined || changes.endTime !== undefined;
    if (timeChanged && sessionHasEnded(session)) {
      throw new AppError(409, "La clase ya terminó; no se puede cambiar su horario", "SESSION_NOT_EDITABLE");
    }

    const before = {
      startTime: session.startTime,
      endTime: session.endTime,
      spaceId: session.spaceId ? String(session.spaceId) : null,
      professorIds: session.professorIds.map(String)
    };

    if (changes.startTime !== undefined) session.startTime = changes.startTime;
    if (changes.endTime !== undefined) session.endTime = changes.endTime;
    assertValidSlot(session);

    if (changes.spaceId !== undefined) {
      if (changes.spaceId) await assertUsableSpace(actor.organizationId, changes.spaceId, danceClass.branchId, dbSession);
      session.spaceId = changes.spaceId ? new Types.ObjectId(changes.spaceId) : undefined;
    }

    if (changes.professorIds !== undefined) {
      const professors = normalizedProfessorIds(changes.professorIds);
      if (professors.length) {
        const valid = await ProfessorModel.countDocuments({
          organizationId: actor.organizationId,
          _id: { $in: professors },
          isActive: true
        }).session(dbSession ?? null);
        if (valid !== professors.length) throw new AppError(422, "Uno o más profesores no son válidos", "INVALID_PROFESSORS");
      }
      session.professorIds = professors;
      const groupSet = new Set((danceClass.professorIds ?? []).map(String));
      session.substitute = professors.length > 0 && professors.some((id) => !groupSet.has(String(id)));
    }

    if (changes.notes !== undefined) session.notes = changes.notes.trim() || undefined;

    if (holdsSlot(session.status)) {
      assertNoConflicts(
        await findSessionConflicts(
          actor.organizationId,
          {
            date: session.sessionDate,
            startTime: session.startTime,
            endTime: session.endTime,
            spaceId: session.spaceId,
            professorIds: teachingProfessors(session, danceClass),
            excludeSessionIds: [session._id]
          },
          dbSession
        )
      );
      session.slotKey = slotKeyOf(session);
    }

    session.manualOverride = true;
    await session.save({ session: dbSession }).catch(rethrowSlotTaken);
    await audit(actor, "CLASS_SESSION_UPDATED", session._id, {
      before,
      after: {
        startTime: session.startTime,
        endTime: session.endTime,
        spaceId: session.spaceId ? String(session.spaceId) : null,
        professorIds: session.professorIds.map(String)
      },
      reason: changes.reason
    }, dbSession);
    return session;
  });
}

export interface RescheduleInput {
  date: string;
  startTime: string;
  endTime: string;
  spaceId?: string | null;
  reason: string;
}

/**
 * Moves a session to another day or time. The original keeps its identity with status
 * RESCHEDULED and points to the new session; the new one copies the original roster and
 * remembers where it came from, so payments of the original cover it (no second charge).
 */
export async function rescheduleSession(actor: Actor, sessionId: string, input: RescheduleInput) {
  if (!isCalendarDate(input.date)) throw new AppError(422, "La fecha no es válida", "INVALID_DATE");
  assertValidSlot(input);
  const today = academyNow();
  if (`${input.date}T${input.startTime}` <= `${today.date}T${today.time}`) {
    throw new AppError(422, "La nueva fecha debe ser futura", "RESCHEDULE_IN_PAST");
  }
  const preview = await ClassSessionModel.findOne({ _id: sessionId, organizationId: actor.organizationId }).lean<any>();
  if (!preview) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  const lockKeys = [
    calendarLockKey(preview.sessionDate),
    calendarLockKey(input.date),
    sessionLockKey(sessionId),
    ...(preview.rescheduledFromSessionId ? [sessionLockKey(String(preview.rescheduledFromSessionId))] : [])
  ];
  await ensureLocks(actor.organizationId, lockKeys);

  const result = await withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, lockKeys, dbSession);
    const { session, danceClass } = await loadSessionForUpdate(actor.organizationId, sessionId, dbSession);
    assertTransition(session.status as SessionStatus, "RESCHEDULED", input.reason);

    const spaceId = input.spaceId === undefined ? session.spaceId : input.spaceId ? new Types.ObjectId(input.spaceId) : undefined;
    if (spaceId) await assertUsableSpace(actor.organizationId, spaceId, danceClass.branchId, dbSession);
    const professorIds = session.professorIds;

    // A drag can bring a rescheduled class back to the exact slot it came from. In that
    // case recover the original occurrence instead of attempting to create a duplicate
    // session for that same regular slot.
    const original = session.rescheduledFromSessionId
      ? await ClassSessionModel.findOne({ _id: session.rescheduledFromSessionId, organizationId: actor.organizationId }).session(dbSession ?? null)
      : null;
    const returnsToOriginal =
      original &&
      original.status === "RESCHEDULED" &&
      String(original.rescheduledToSessionId) === String(session._id) &&
      original.sessionDate === input.date &&
      original.startTime === input.startTime &&
      original.endTime === input.endTime;

    if (returnsToOriginal) {
      assertNoConflicts(
        await findSessionConflicts(
          actor.organizationId,
          {
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            spaceId,
            professorIds: teachingProfessors(session, danceClass),
            excludeSessionIds: [session._id, original._id]
          },
          dbSession
        )
      );

      const reason = "Reprogramación revertida al horario original";
      const fromReplacement = session.status as SessionStatus;
      session.status = "CANCELLED";
      session.statusReason = reason;
      session.slotKey = undefined;
      session.statusHistory.push(statusChange(fromReplacement, "CANCELLED", reason, actor.userId) as never);
      await session.save({ session: dbSession });

      original.status = "SCHEDULED";
      original.statusReason = undefined;
      original.rescheduledToSessionId = undefined;
      original.slotKey = slotKeyOf(original);
      original.statusHistory.push(statusChange("RESCHEDULED", "SCHEDULED", reason, actor.userId) as never);
      await original.save({ session: dbSession }).catch(rethrowSlotTaken);

      await audit(actor, "CLASS_SESSION_RESCHEDULE_REVERTED", original._id, {
        restoredFromSessionId: session._id,
        date: original.sessionDate,
        startTime: original.startTime
      }, dbSession);
      return { original, replacement: original };
    }

    assertNoConflicts(
      await findSessionConflicts(
        actor.organizationId,
        {
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          spaceId,
          professorIds: teachingProfessors(session, danceClass),
          excludeSessionIds: [session._id]
        },
        dbSession
      )
    );

    // Who was expected at the original meeting is who is expected at the new one.
    await freezeRoster(actor.organizationId, session, dbSession);
    const participants = await ClassAttendanceModel.find({
      organizationId: actor.organizationId,
      sessionId: session._id,
      removedAt: { $exists: false }
    })
      .session(dbSession ?? null)
      .lean<any[]>();

    const [replacement] = await ClassSessionModel.create(
      [
        {
          organizationId: session.organizationId,
          branchId: session.branchId,
          classId: session.classId,
          sessionDate: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          status: "SCHEDULED",
          origin: "RESCHEDULED",
          seriesId: session.seriesId,
          spaceId,
          professorIds,
          substitute: session.substitute,
          manualOverride: true,
          slotKey: slotKeyOf({ classId: session.classId, sessionDate: input.date, startTime: input.startTime }),
          rescheduledFromSessionId: session._id,
          rosterFrozenAt: new Date(),
          statusHistory: [statusChange(null, "SCHEDULED", `Reprogramación de ${session.sessionDate} ${session.startTime}`, actor.userId)]
        }
      ],
      { session: dbSession }
    ).catch(rethrowSlotTaken);

    if (participants.length) {
      await ClassAttendanceModel.insertMany(
        participants.map((row) => ({
          organizationId: row.organizationId,
          sessionId: replacement._id,
          studentId: row.studentId,
          status: "EXPECTED",
          participantType: row.participantType ?? "ENROLLMENT",
          enrollmentId: row.enrollmentId,
          trialId: row.trialId,
          sourceSessionId: session._id
        })),
        { session: dbSession }
      );
    }

    const from = session.status as SessionStatus;
    session.status = "RESCHEDULED";
    session.statusReason = input.reason.trim();
    session.rescheduledToSessionId = replacement._id;
    session.slotKey = undefined;
    session.statusHistory.push(statusChange(from, "RESCHEDULED", input.reason, actor.userId) as never);
    await session.save({ session: dbSession });

    await audit(actor, "CLASS_SESSION_RESCHEDULED", session._id, {
      from: { date: session.sessionDate, startTime: session.startTime },
      to: { date: input.date, startTime: input.startTime, endTime: input.endTime },
      newSessionId: replacement._id,
      reason: input.reason
    }, dbSession);

    return { original: session, replacement };
  });

  return result;
}

export interface ExtraSessionInput {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  spaceId?: string | null;
  professorIds?: string[];
  notes?: string;
}

/** A one-off meeting of a group outside its recurring schedule (for the whole group). */
export async function createExtraSession(actor: Actor, input: ExtraSessionInput) {
  if (!isCalendarDate(input.date)) throw new AppError(422, "La fecha no es válida", "INVALID_DATE");
  assertValidSlot(input);
  if (input.date < academyNow().date) throw new AppError(422, "La fecha debe ser hoy o futura", "EXTRA_SESSION_IN_PAST");
  await ensureLocks(actor.organizationId, [calendarLockKey(input.date)]);

  return withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [calendarLockKey(input.date)], dbSession);
    const danceClass = await DanceClassModel.findOne({ _id: input.classId, organizationId: actor.organizationId })
      .session(dbSession ?? null)
      .lean<any>();
    if (!danceClass || isArchivedStatus(danceClass.status)) {
      throw new AppError(404, "Clase no encontrada o archivada", "CLASS_NOT_FOUND");
    }
    if (input.spaceId) await assertUsableSpace(actor.organizationId, input.spaceId, danceClass.branchId, dbSession);
    const professorIds = normalizedProfessorIds(input.professorIds);

    assertNoConflicts(
      await findSessionConflicts(
        actor.organizationId,
        {
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          spaceId: input.spaceId,
          professorIds: professorIds.length ? professorIds : danceClass.professorIds
        },
        dbSession
      )
    );

    const [session] = await ClassSessionModel.create(
      [
        {
          organizationId: danceClass.organizationId,
          branchId: danceClass.branchId,
          classId: danceClass._id,
          sessionDate: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          status: "SCHEDULED",
          origin: "EXTRA",
          spaceId: input.spaceId ? new Types.ObjectId(input.spaceId) : undefined,
          professorIds,
          manualOverride: true,
          notes: input.notes?.trim() || undefined,
          slotKey: slotKeyOf({ classId: danceClass._id, sessionDate: input.date, startTime: input.startTime }),
          statusHistory: [statusChange(null, "SCHEDULED", "Clase extraordinaria", actor.userId)]
        }
      ],
      { session: dbSession }
    ).catch(rethrowSlotTaken);

    await audit(actor, "CLASS_SESSION_EXTRA_CREATED", session._id, {
      classId: danceClass._id,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime
    }, dbSession);
    return session;
  });
}

/**
 * Adds a student to one session only (drop-in, guest or makeup). Capacity is checked inside the
 * transaction after bumping the session lock, so the last seat cannot be given twice.
 */
export async function addSessionParticipant(
  actor: Actor,
  sessionId: string,
  input: { studentId: string; participantType: "AUTHORIZED" | "MAKEUP"; sourceSessionId?: string; note?: string }
) {
  await ensureLocks(actor.organizationId, [sessionLockKey(sessionId)]);
  return withTransaction(async (dbSession) => {
    await touchLocks(actor.organizationId, [sessionLockKey(sessionId)], dbSession);
    const { session, danceClass } = await loadSessionForUpdate(actor.organizationId, sessionId, dbSession);
    if (!["SCHEDULED", "IN_PROGRESS"].includes(session.status)) {
      throw new AppError(409, "Sólo se pueden sumar alumnos a clases programadas", "SESSION_NOT_EDITABLE");
    }
    const student = await StudentModel.findOne({ _id: input.studentId, organizationId: actor.organizationId, isActive: true })
      .session(dbSession ?? null)
      .lean<any>();
    if (!student) throw new AppError(404, "Alumno no encontrado o inactivo", "STUDENT_NOT_FOUND");

    const roster = await loadRoster(actor.organizationId, session, { dbSession });
    if (roster.some((item) => item.studentId === String(student._id))) {
      throw new AppError(409, "El alumno ya forma parte de esta clase", "ALREADY_IN_SESSION");
    }
    await assertSeatAvailable(actor.organizationId, session, danceClass.capacity, dbSession);

    const row = await ClassAttendanceModel.findOneAndUpdate(
      { organizationId: actor.organizationId, sessionId: session._id, studentId: student._id },
      {
        $set: {
          status: "EXPECTED",
          participantType: input.participantType,
          addedByUserId: new Types.ObjectId(actor.userId),
          ...(input.sourceSessionId ? { sourceSessionId: new Types.ObjectId(input.sourceSessionId) } : {}),
          ...(input.note ? { note: input.note } : {})
        },
        $unset: { removedAt: 1 }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
    );

    await audit(actor, "SESSION_PARTICIPANT_ADDED", session._id, {
      studentId: student._id,
      participantType: input.participantType,
      sourceSessionId: input.sourceSessionId
    }, dbSession);
    return row;
  });
}

/** Removes a participant that was added on purpose to an upcoming session. */
export async function removeSessionParticipant(actor: Actor, sessionId: string, studentId: string) {
  return withTransaction(async (dbSession) => {
    const { session } = await loadSessionForUpdate(actor.organizationId, sessionId, dbSession);
    if (sessionHasEnded(session) || !["SCHEDULED", "IN_PROGRESS"].includes(session.status)) {
      throw new AppError(409, "La clase ya se realizó", "SESSION_NOT_EDITABLE");
    }
    const row = await ClassAttendanceModel.findOne({
      organizationId: actor.organizationId,
      sessionId: session._id,
      studentId,
      participantType: { $in: ["AUTHORIZED", "MAKEUP"] },
      removedAt: { $exists: false }
    }).session(dbSession ?? null);
    if (!row) {
      throw new AppError(404, "Sólo se pueden quitar alumnos agregados para esta clase", "PARTICIPANT_NOT_REMOVABLE");
    }
    row.removedAt = new Date();
    await row.save({ session: dbSession });
    await audit(actor, "SESSION_PARTICIPANT_REMOVED", session._id, { studentId }, dbSession);
    return row;
  });
}

/**
 * Prepares (does not send) the notices for students and professors affected by a session change.
 * They are stored as PENDING notification logs that the existing communication tools can send.
 */
export async function prepareSessionChangeNotices(
  actor: Actor,
  sessionId: string,
  message: string
) {
  const session = await ClassSessionModel.findOne({ _id: sessionId, organizationId: actor.organizationId }).lean<any>();
  if (!session) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId: actor.organizationId }).lean<any>();
  const roster = await loadRoster(actor.organizationId, session);
  const students = await StudentModel.find({
    organizationId: actor.organizationId,
    _id: { $in: roster.map((item) => new Types.ObjectId(item.studentId)) }
  })
    .select("email firstName")
    .lean<any[]>();
  const professorIds = session.professorIds?.length ? session.professorIds : danceClass?.professorIds ?? [];
  const professors = await ProfessorModel.find({ organizationId: actor.organizationId, _id: { $in: professorIds } })
    .select("userId")
    .lean<any[]>();
  const users = await UserModel.find({ organizationId: actor.organizationId, _id: { $in: professors.map((item) => item.userId) } })
    .select("email")
    .lean<any[]>();

  const subject = `Cambio en ${danceClass?.name ?? "tu clase"} del ${session.sessionDate}`;
  const documents = [
    ...students.filter((item) => item.email).map((item) => ({ studentId: item._id, destination: item.email })),
    ...users.filter((item) => item.email).map((item) => ({ studentId: undefined, destination: item.email }))
  ].map((recipient) => ({
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    studentId: recipient.studentId,
    channel: "EMAIL",
    type: "SESSION_CHANGE",
    destination: recipient.destination,
    subject,
    message,
    status: "PENDING"
  }));
  if (documents.length) await NotificationLogModel.insertMany(documents);
  return { prepared: documents.length, students: students.length, professors: users.length };
}

export type { SessionDoc };
