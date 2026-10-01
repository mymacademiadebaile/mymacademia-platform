import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { academyNow, weekDayFor } from "../../common/dates";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { OrganizationModel } from "../core/organization.model";
import { ATTENDANCE_STATUSES } from "../sessions/class-attendance.model";
import {
  CLASS_SESSION_STATUSES,
  ClassSessionModel
} from "../sessions/class-session.model";
import {
  ensureSessions,
  loadSessionParticipants,
  setSessionAttendance
} from "../sessions/session-service";
import { SessionBookingModel } from "../sessions/session-booking.model";
import {
  assertCancellationWindow,
  assertSessionCapacity,
  sessionEnrollmentIds
} from "../sessions/session-booking-service";
import { objectIdSchema } from "./admin.schemas";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuerySchema = z.object({
  date: dateSchema
});
const attendanceSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES)
});
const sessionStatusSchema = z.object({
  status: z.enum(CLASS_SESSION_STATUSES).refine(
    (value) => value === "COMPLETED" || value === "CANCELLED",
    "Sólo se puede completar o cancelar una clase desde este endpoint"
  )
});
const enrollmentIdSchema = z.object({ enrollmentId: objectIdSchema });
const transferSchema = z.object({
  enrollmentId: objectIdSchema,
  targetSessionId: objectIdSchema
});

export const adminSessionsRouter = Router();

adminSessionsRouter.get("/", async (request, response, next) => {
  try {
    const { date } = listQuerySchema.parse(request.query);
    const organizationId = request.auth!.organizationId;
    const day = weekDayFor(date);

    const classes = await DanceClassModel.find({
      organizationId,
      status: "ACTIVE",
      "schedules.day": day
    })
      .populate("professorIds", "displayName avatarUrl")
      .lean();

    await ensureSessions(organizationId, classes as Array<any>, date, date);

    const classIds = classes.map((item) => item._id);
    const [sessions, enrollmentCounts] = await Promise.all([
      ClassSessionModel.find({
        organizationId,
        sessionDate: date,
        classId: { $in: classIds }
      }).lean(),
      EnrollmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        {
          $match: {
            organizationId: new Types.ObjectId(organizationId),
            classId: { $in: classIds },
            status: "ACTIVE"
          }
        },
        { $group: { _id: "$classId", count: { $sum: 1 } } }
      ])
    ]);

    const classMap = new Map(
      (classes as Array<any>).map((item) => [String(item._id), item])
    );
    const countMap = new Map(
      enrollmentCounts.map((item) => [String(item._id), item.count])
    );

    const items = sessions
      .map((session) => {
        const danceClass = classMap.get(String(session.classId));
        if (!danceClass) return null;

        return {
          id: String(session._id),
          sessionDate: session.sessionDate,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
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
          enrolledCount: countMap.get(String(session.classId)) ?? 0
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

    response.json({ date, items });
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const organizationId = request.auth!.organizationId;

    const session = await ClassSessionModel.findOne({
      _id: id,
      organizationId
    }).lean();

    if (!session) {
      throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
    }

    const danceClass = await DanceClassModel.findOne({
      _id: session.classId,
      organizationId
    })
      .populate("professorIds", "displayName avatarUrl")
      .lean();

    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    const participants = await loadSessionParticipants(
      organizationId,
      session,
      danceClass as any
    );
    await ensureSessions(organizationId, [danceClass as any], session.sessionDate, session.sessionDate);
    const alternatives = await ClassSessionModel.find({
      organizationId,
      classId: session.classId,
      sessionDate: session.sessionDate,
      _id: { $ne: session._id },
      status: { $ne: "CANCELLED" }
    })
      .sort({ startTime: 1 })
      .lean();
    const billingMode = (danceClass as any).billingMode ?? "MONTHLY";
    const pricePerClass = (danceClass as any).pricePerClass ?? 0;
    const monthlyPrice = (danceClass as any).monthlyPrice ?? 0;

    response.json({
      id: String(session._id),
      sessionDate: session.sessionDate,
      startTime: session.startTime,
      endTime: session.endTime,
      status: session.status,
      class: {
        id: String((danceClass as any)._id),
        name: (danceClass as any).name,
        capacity: (danceClass as any).capacity,
        billingMode,
        pricePerClass,
        monthlyPrice,
        professors: ((danceClass as any).professorIds ?? []).map((professor: any) => ({
          id: String(professor._id),
          displayName: professor.displayName,
          avatarUrl: professor.avatarUrl
        }))
      },
      participants,
      alternatives: alternatives.map((item) => ({
        id: String(item._id), startTime: item.startTime, endTime: item.endTime
      }))
    });
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

    const session = await ClassSessionModel.findOne({
      _id: id,
      organizationId
    });

    if (!session) {
      throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
    }

    const attendance = await setSessionAttendance(
      organizationId,
      session,
      studentId,
      status,
      request.auth!.userId
    );

    response.json(attendance);
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
    if (session.status !== "SCHEDULED") throw new AppError(422, "El turno ya no está disponible para cancelación", "SESSION_UNAVAILABLE");
    const enrolled = await sessionEnrollmentIds(organizationId, session);
    if (!enrolled.some((item) => item._id.equals(enrollment._id))) {
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

/** Move a booked student to another time of the same class and date. Changes have no fee or limit. */
adminSessionsRouter.post("/:id/bookings/transfer", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = transferSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;
    const [source, target, enrollment] = await Promise.all([
      ClassSessionModel.findOne({ _id: id, organizationId }),
      ClassSessionModel.findOne({ _id: input.targetSessionId, organizationId }),
      EnrollmentModel.findOne({ _id: input.enrollmentId, organizationId, status: "ACTIVE" })
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
      `${source.sessionDate}T${source.startTime}` <= `${now.date}T${now.time}`
    ) {
      throw new AppError(422, "El turno seleccionado no está disponible", "SESSION_UNAVAILABLE");
    }
    const current = await sessionEnrollmentIds(organizationId, source);
    if (!current.some((item) => item._id.equals(enrollment._id))) {
      throw new AppError(422, "El alumno no tiene turno reservado en el horario de origen", "STUDENT_NOT_BOOKED");
    }
    const actualClass = await DanceClassModel.findOne({ _id: source.classId, organizationId, status: "ACTIVE" });
    if (!actualClass) throw new AppError(404, "Clase no encontrada o inactiva", "CLASS_NOT_FOUND");
    await assertSessionCapacity(organizationId, target, actualClass.capacity, enrollment._id);

    const changedAt = new Date();
    await Promise.all([
      SessionBookingModel.findOneAndUpdate(
        { organizationId, sessionId: source._id, enrollmentId: enrollment._id },
        { $set: { classId: source.classId, studentId: enrollment.studentId, status: "CANCELLED", changedByUserId: request.auth!.userId, changedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ),
      SessionBookingModel.findOneAndUpdate(
        { organizationId, sessionId: target._id, enrollmentId: enrollment._id },
        { $set: { classId: target.classId, studentId: enrollment.studentId, status: "BOOKED", sourceSessionId: source._id, changedByUserId: request.auth!.userId, changedAt } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    ]);
    await AuditLogModel.create({
      organizationId, actorUserId: request.auth!.userId, action: "SESSION_BOOKING_TRANSFERRED",
      entityType: "Enrollment", entityId: enrollment._id,
      metadata: { enrollmentId: enrollment._id, studentId: enrollment.studentId, sourceSessionId: source._id, targetSessionId: target._id }
    });
    response.status(201).json({ sourceSessionId: String(source._id), targetSessionId: String(target._id), enrollmentId: String(enrollment._id) });
  } catch (error) {
    next(error);
  }
});

adminSessionsRouter.patch("/:id/status", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const { status } = sessionStatusSchema.parse(request.body);
    const organizationId = request.auth!.organizationId;

    const session = await ClassSessionModel.findOne({
      _id: id,
      organizationId
    });

    if (!session) {
      throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
    }

    session.status = status;
    session.completedAt = status === "COMPLETED" ? new Date() : undefined;
    await session.save();

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: status === "COMPLETED" ? "CLASS_SESSION_COMPLETED" : "CLASS_SESSION_CANCELLED",
      entityType: "ClassSession",
      entityId: session._id,
      metadata: {
        classId: session.classId,
        sessionDate: session.sessionDate,
        startTime: session.startTime
      }
    });

    response.json(session);
  } catch (error) {
    next(error);
  }
});
