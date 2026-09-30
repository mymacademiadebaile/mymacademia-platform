import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { weekDayFor } from "../../common/dates";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
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
      participants
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
