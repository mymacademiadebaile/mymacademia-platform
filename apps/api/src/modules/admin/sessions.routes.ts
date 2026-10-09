import { SESSION_STATUSES } from "@mym/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { academyNow, TIME_PATTERN } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { ensureClassCharge } from "../billing/charge-service";
import { ATTENDANCE_STATUSES } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { assertCancellationWindow } from "../sessions/session-booking-service";
import { loadSessionParticipants, resolvedBillingPreference, setSessionAttendance } from "../sessions/session-service";
import { billingModeOn } from "../enrollments/enrollment-validity";
import {
  assertSeatAvailable,
  ensureLocks,
  loadRoster,
  rosterCounts,
  sessionLockKey,
  touchLocks
} from "../sessions/roster-service";
import {
  addSessionParticipant,
  changeSessionStatus,
  createExtraSession,
  prepareSessionChangeNotices,
  removeSessionParticipant,
  rescheduleSession,
  reopenSession,
  updateSingleSession
} from "../scheduling/session-commands";
import { generateSessions } from "../scheduling/session-generator";
import { calendarDateSchema, objectIdSchema } from "./admin.schemas";

const timeSchema = z.string().regex(TIME_PATTERN, "La hora debe tener formato HH:mm");
const listQuerySchema = z.object({ date: calendarDateSchema });
const attendanceSchema = z.object({ status: z.enum(ATTENDANCE_STATUSES) });
const statusSchema = z.object({
  status: z.enum(SESSION_STATUSES),
  reason: z.string().trim().max(500).optional()
});
const enrollmentIdSchema = z.object({ enrollmentId: objectIdSchema });
const transferSchema = z.object({ enrollmentId: objectIdSchema, targetSessionId: objectIdSchema });
const updateSchema = z.object({
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  spaceId: objectIdSchema.nullable().optional(),
  professorIds: z.array(objectIdSchema).max(10).optional(),
  notes: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(500).optional()
});
const rescheduleSchema = z.object({
  date: calendarDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  spaceId: objectIdSchema.nullable().optional(),
  reason: z.string().trim().min(3).max(500)
});
const reopenSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const extraSchema = z.object({
  classId: objectIdSchema,
  date: calendarDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  spaceId: objectIdSchema.nullable().optional(),
  professorIds: z.array(objectIdSchema).max(10).optional(),
  notes: z.string().trim().max(1000).optional()
});
const participantSchema = z.object({
  studentId: objectIdSchema,
  participantType: z.enum(["AUTHORIZED", "MAKEUP"]).default("AUTHORIZED"),
  sourceSessionId: objectIdSchema.optional(),
  note: z.string().trim().max(300).optional()
});
const noticeSchema = z.object({ message: z.string().trim().min(5).max(2000) });
const chargeSchema = z.object({ studentId: objectIdSchema });

export const adminSessionsRouter = Router();

const actorOf = (request: Express.Request) => ({
  organizationId: request.auth!.organizationId,
  userId: request.auth!.userId
});

function serializeProfessors(ids: unknown[], professorById: Map<string, any>) {
  return ids
    .map((id) => professorById.get(String(id)))
    .filter(Boolean)
    .map((professor: any) => ({ id: String(professor._id), displayName: professor.displayName, avatarUrl: professor.avatarUrl }));
}

/** Sessions of one day (legacy "Clase del día" screen). */
adminSessionsRouter.get("/", async (request, response, next) => {
  try {
    const { date } = listQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    await generateSessions(organizationId, { from: date, to: date });

    const sessions = await ClassSessionModel.find({ organizationId, sessionDate: date }).lean<any[]>();
    const classes = await DanceClassModel.find({ organizationId, _id: { $in: sessions.map((item) => item.classId) } })
      .populate("professorIds", "displayName avatarUrl")
      .lean<any[]>();
    const classMap = new Map(classes.map((item) => [String(item._id), item]));
    const counts = await rosterCounts(organizationId, sessions);

    const items = sessions
      .filter((session) => session.status !== "RESCHEDULED")
      .map((session) => {
        const danceClass = classMap.get(String(session.classId));
        if (!danceClass) return null;
        const professorById = new Map<string, any>((danceClass.professorIds ?? []).map((item: any) => [String(item._id), item]));
        return {
          id: String(session._id),
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
          statusReason: session.statusReason,
          origin: session.origin ?? "REGULAR",
          spaceId: session.spaceId ? String(session.spaceId) : null,
          class: {
            id: String(danceClass._id),
            name: danceClass.name,
            capacity: danceClass.capacity,
            billingMode: danceClass.billingMode ?? "MONTHLY",
            pricePerClass: danceClass.pricePerClass ?? 0,
            monthlyPrice: danceClass.monthlyPrice ?? 0,
            freeTrialEnabled: danceClass.freeTrialEnabled,
            professors: (danceClass.professorIds ?? []).map((professor: any) => ({
              id: String(professor._id),
              displayName: professor.displayName,
              avatarUrl: professor.avatarUrl
            }))
          },
          substitute: Boolean(session.substitute),
          professors: session.professorIds?.length ? serializeProfessors(session.professorIds, professorById) : undefined,
          enrolledCount: counts.get(String(session._id)) ?? 0
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

    response.json({ date, items });
  } catch (error) {
    next(error);
  }
});

/** One-off session of a group outside its recurring schedule. */
adminSessionsRouter.post("/", async (request, response, next) => {
  try {
    const input = extraSchema.parse(request.body);
    const session = await createExtraSession(actorOf(request), input);
    response.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const session = await ClassSessionModel.findOne({ _id: id, organizationId }).lean<any>();
    if (!session) {
      throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
    }

    const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId })
      .populate("professorIds", "displayName avatarUrl")
      .lean<any>();
    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    await generateSessions(organizationId, { from: session.sessionDate, to: session.sessionDate, classIds: [danceClass._id] });
    const [participants, alternatives, related] = await Promise.all([
      loadSessionParticipants(organizationId, session, danceClass),
      ClassSessionModel.find({
        organizationId,
        classId: session.classId,
        sessionDate: session.sessionDate,
        _id: { $ne: session._id },
        status: "SCHEDULED"
      })
        .sort({ startTime: 1 })
        .lean<any[]>(),
      ClassSessionModel.find({
        organizationId,
        _id: { $in: [session.rescheduledFromSessionId, session.rescheduledToSessionId].filter(Boolean) }
      })
        .select("sessionDate startTime endTime status")
        .lean<any[]>()
    ]);

    const professorById = new Map<string, any>((danceClass.professorIds ?? []).map((item: any) => [String(item._id), item]));
    const relatedById = new Map(related.map((item) => [String(item._id), item]));
    const summarize = (value?: Types.ObjectId) => {
      const item = value ? relatedById.get(String(value)) : undefined;
      return item ? { id: String(item._id), date: item.sessionDate, startTime: item.startTime, endTime: item.endTime, status: item.status } : null;
    };

    response.json({
      id: String(session._id),
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      statusReason: session.statusReason,
      statusHistory: session.statusHistory ?? [],
      origin: session.origin ?? "REGULAR",
      spaceId: session.spaceId ? String(session.spaceId) : null,
      substitute: Boolean(session.substitute),
      notes: session.notes,
      rosterFrozen: Boolean(session.rosterFrozenAt),
      rescheduledFrom: summarize(session.rescheduledFromSessionId),
      rescheduledTo: summarize(session.rescheduledToSessionId),
      professors: session.professorIds?.length ? serializeProfessors(session.professorIds, professorById) : undefined,
      class: {
        id: String(danceClass._id),
        name: danceClass.name,
        capacity: danceClass.capacity,
        billingMode: danceClass.billingMode ?? "MONTHLY",
        pricePerClass: danceClass.pricePerClass ?? 0,
        monthlyPrice: danceClass.monthlyPrice ?? 0,
        professors: (danceClass.professorIds ?? []).map((professor: any) => ({
          id: String(professor._id),
          displayName: professor.displayName,
          avatarUrl: professor.avatarUrl
        }))
      },
      participants,
      alternatives: alternatives.map((item) => ({ id: String(item._id), startTime: item.startTime, endTime: item.endTime }))
    });
  } catch (error) {
    next(error);
  }
});

/** "Only this session": time, space, professors (substitutes) or notes. */
adminSessionsRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateSchema.parse(request.body);
    response.json(await updateSingleSession(actorOf(request), id, input));
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.patch("/:id/attendance/:studentId", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const studentId = objectIdSchema.parse(request.params.studentId);
    const { status } = attendanceSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const session = await ClassSessionModel.findOne({ _id: id, organizationId });
    if (!session) {
      throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
    }

    const attendance = await setSessionAttendance(organizationId, session, studentId, status, request.auth!.userId);

    // A per-class obligation begins with confirmed attendance, never merely with enrollment.
    // Monthly and free students keep their usual coverage and trials remain free.
    let chargeCreated = false;
    if (status === "PRESENT" && attendance.participantType !== "TRIAL") {
      const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId }).lean<any>();
      const enrollment = attendance.enrollmentId
        ? await EnrollmentModel.findOne({ _id: attendance.enrollmentId, organizationId }).lean<any>()
        : null;
      const billingType = danceClass
        ? resolvedBillingPreference(danceClass, enrollment ? billingModeOn(enrollment, session.sessionDate) : "PER_CLASS")
        : "FREE";

      if (billingType === "PER_CLASS") {
        const result = await ensureClassCharge(actorOf(request), id, studentId);
        chargeCreated = Boolean(!result.covered && result.created);
      }
    }

    response.json({ ...attendance.toObject(), chargeCreated });
  } catch (error) {
    next(error);
  }
});

/** Status change through the state machine (suspend, cancel, complete, restore...). */
adminSessionsRouter.patch("/:id/status", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { status, reason } = statusSchema.parse(request.body);
    if (status === "RESCHEDULED") {
      throw new AppError(422, "Para reprogramar indicá la nueva fecha y horario", "RESCHEDULE_REQUIRES_DATE");
    }
    response.json(await changeSessionStatus(actorOf(request), id, status, reason));
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.post("/:id/reschedule", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = rescheduleSchema.parse(request.body);
    const result = await rescheduleSession(actorOf(request), id, input);
    response.status(201).json({ originalId: String(result.original._id), session: result.replacement });
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.post("/:id/reopen", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { reason } = reopenSchema.parse(request.body);
    response.json(await reopenSession(actorOf(request), id, reason));
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.post("/:id/participants", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = participantSchema.parse(request.body);
    response.status(201).json(await addSessionParticipant(actorOf(request), id, input));
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.delete("/:id/participants/:studentId", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const studentId = objectIdSchema.parse(request.params.studentId);
    await removeSessionParticipant(actorOf(request), id, studentId);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

/** Prepares notices for the students and professors of a session (sent from Comunicaciones). */
adminSessionsRouter.post("/:id/notices", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { message } = noticeSchema.parse(request.body);
    response.status(201).json(await prepareSessionChangeNotices(actorOf(request), id, message));
  } catch (error) {
    next(error);
  }
});

/** Class fee of a participant (created only if not covered by a monthly fee or an existing charge). */
adminSessionsRouter.post("/:id/charges", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { studentId } = chargeSchema.parse(request.body);
    const result = await ensureClassCharge(actorOf(request), id, studentId);
    response.status(result.covered ? 200 : result.created ? 201 : 200).json(result);
  } catch (error) {
    next(error);
  }
});

/** Cancel this student's recurring or previously moved booking for one concrete session. */
adminSessionsRouter.post("/:id/bookings/cancel", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { enrollmentId } = enrollmentIdSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const [session, enrollment, organization] = await Promise.all([
      ClassSessionModel.findOne({ _id: id, organizationId }),
      EnrollmentModel.findOne({ _id: enrollmentId, organizationId, status: "ACTIVE" }),
      OrganizationModel.findById(organizationId).select("cancellationNoticeHours")
    ]);
    if (!session) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
    if (!enrollment || !enrollment.classId.equals(session.classId)) {
      throw new AppError(422, "La inscripción no corresponde a esta clase", "INVALID_SESSION_ENROLLMENT");
    }
    if (session.status !== "SCHEDULED" || session.rosterFrozenAt) {
      throw new AppError(422, "El turno ya no está disponible para cancelación", "SESSION_UNAVAILABLE");
    }
    const roster = await loadRoster(organizationId, session);
    if (!roster.some((item) => item.enrollmentId === String(enrollment._id))) {
      throw new AppError(422, "El alumno no tiene turno reservado en esta fecha", "STUDENT_NOT_BOOKED");
    }
    assertCancellationWindow(session, organization?.cancellationNoticeHours ?? 6);

    const booking = await SessionBookingModel.findOneAndUpdate(
      { organizationId, sessionId: session._id, enrollmentId: enrollment._id },
      {
        $set: {
          classId: session.classId,
          studentId: enrollment.studentId,
          status: "CANCELLED",
          changedByUserId: request.auth!.userId,
          changedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await AuditLogModel.create({
      organizationId, actorUserId: request.auth!.userId, action: "SESSION_BOOKING_CANCELLED",
      entityType: "SessionBooking", entityId: booking._id,
      metadata: { sessionId: session._id, enrollmentId: enrollment._id, studentId: enrollment.studentId }
    });
    response.json(booking);
  } catch (error) {
    next(error);
  }
});

/**
 * Move a booked student to another time of the same class and date. The target's capacity is
 * checked inside a transaction that bumps its lock, so the last seat cannot be taken twice.
 */
adminSessionsRouter.post("/:id/bookings/transfer", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = transferSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    await ensureLocks(organizationId, [sessionLockKey(input.targetSessionId)]);

    const result = await withTransaction(async (dbSession) => {
      await touchLocks(organizationId, [sessionLockKey(input.targetSessionId)], dbSession);
      const [source, target, enrollment] = await Promise.all([
        ClassSessionModel.findOne({ _id: id, organizationId }).session(dbSession ?? null),
        ClassSessionModel.findOne({ _id: input.targetSessionId, organizationId }).session(dbSession ?? null),
        EnrollmentModel.findOne({ _id: input.enrollmentId, organizationId, status: "ACTIVE" }).session(dbSession ?? null)
      ]);
      if (!source || !target) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
      if (!enrollment || !enrollment.classId.equals(source.classId) || !target.classId.equals(source.classId) || target.sessionDate !== source.sessionDate) {
        throw new AppError(422, "El cambio debe ser entre turnos de la misma clase y fecha", "INVALID_SESSION_TRANSFER");
      }
      const now = academyNow();
      if (
        source._id.equals(target._id) ||
        source.status !== "SCHEDULED" ||
        target.status !== "SCHEDULED" ||
        source.rosterFrozenAt ||
        target.rosterFrozenAt ||
        `${source.sessionDate}T${source.startTime}` <= `${now.date}T${now.time}` ||
        `${target.sessionDate}T${target.startTime}` <= `${now.date}T${now.time}`
      ) {
        throw new AppError(422, "El turno seleccionado no está disponible", "SESSION_UNAVAILABLE");
      }
      const sourceRoster = await loadRoster(organizationId, source, { dbSession });
      if (!sourceRoster.some((item) => item.enrollmentId === String(enrollment._id))) {
        throw new AppError(422, "El alumno no tiene turno reservado en el horario de origen", "STUDENT_NOT_BOOKED");
      }
      const actualClass = await DanceClassModel.findOne({ _id: source.classId, organizationId }).session(dbSession ?? null);
      if (!actualClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
      await assertSeatAvailable(organizationId, target, actualClass.capacity, dbSession, String(enrollment.studentId));

      const changedAt = new Date();
      await SessionBookingModel.findOneAndUpdate(
        { organizationId, sessionId: source._id, enrollmentId: enrollment._id },
        { $set: { classId: source.classId, studentId: enrollment.studentId, status: "CANCELLED", changedByUserId: request.auth!.userId, changedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
      await SessionBookingModel.findOneAndUpdate(
        { organizationId, sessionId: target._id, enrollmentId: enrollment._id },
        { $set: { classId: target.classId, studentId: enrollment.studentId, status: "BOOKED", sourceSessionId: source._id, changedByUserId: request.auth!.userId, changedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
      await AuditLogModel.create(
        [{
          organizationId, actorUserId: request.auth!.userId, action: "SESSION_BOOKING_TRANSFERRED",
          entityType: "Enrollment", entityId: enrollment._id,
          metadata: { enrollmentId: enrollment._id, studentId: enrollment.studentId, sourceSessionId: source._id, targetSessionId: target._id }
        }],
        { session: dbSession }
      );
      return { sourceSessionId: String(source._id), targetSessionId: String(target._id), enrollmentId: String(enrollment._id) };
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
