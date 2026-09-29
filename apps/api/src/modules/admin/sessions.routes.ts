import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import {
  ATTENDANCE_STATUSES,
  ClassAttendanceModel
} from "../sessions/class-attendance.model";
import {
  CLASS_SESSION_STATUSES,
  ClassSessionModel
} from "../sessions/class-session.model";
import { TrialBookingModel } from "../trials/trial-booking.model";
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

const weekDays = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY"
] as const;

function weekDayFor(date: string) {
  return weekDays[new Date(date + "T12:00:00.000Z").getUTCDay()];
}

function utcDayRange(date: string) {
  const start = new Date(date + "T00:00:00.000Z");
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function effectivePaymentStatus(payment: {
  status: string;
  dueDate: Date;
}) {
  if (payment.status === "PENDING" && payment.dueDate.getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
}

function resolvedBillingPreference(
  danceClass: { billingMode?: string },
  preference?: string
) {
  const mode = danceClass.billingMode ?? "MONTHLY";
  if (mode === "FREE") return "FREE";
  if (mode === "PER_CLASS") return "PER_CLASS";
  if (mode === "MONTHLY") return "MONTHLY";
  return preference === "MONTHLY" ? "MONTHLY" : "PER_CLASS";
}

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

    const occurrences: Array<{
      classId: Types.ObjectId;
      branchId: Types.ObjectId;
      startTime: string;
      endTime: string;
    }> = [];

    for (const danceClass of classes as Array<any>) {
      for (const schedule of danceClass.schedules ?? []) {
        if (schedule.day !== day) continue;
        occurrences.push({
          classId: danceClass._id,
          branchId: danceClass.branchId,
          startTime: schedule.startTime,
          endTime: schedule.endTime
        });
      }
    }

    if (occurrences.length > 0) {
      await ClassSessionModel.bulkWrite(
        occurrences.map((occurrence) => ({
          updateOne: {
            filter: {
              organizationId,
              classId: occurrence.classId,
              sessionDate: date,
              startTime: occurrence.startTime
            },
            update: {
              $setOnInsert: {
                organizationId,
                branchId: occurrence.branchId,
                classId: occurrence.classId,
                sessionDate: date,
                startTime: occurrence.startTime,
                endTime: occurrence.endTime,
                status: "SCHEDULED"
              }
            },
            upsert: true
          }
        }))
      );
    }

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

    const { start, end } = utcDayRange(session.sessionDate);
    const period = session.sessionDate.slice(0, 7);

    const [enrollments, trials, attendance] = await Promise.all([
      EnrollmentModel.find({
        organizationId,
        classId: session.classId,
        status: "ACTIVE"
      })
        .populate("studentId", "firstName lastName email phone isActive")
        .lean(),
      TrialBookingModel.find({
        organizationId,
        classId: session.classId,
        status: "SCHEDULED",
        scheduledFor: { $gte: start, $lt: end }
      })
        .populate("studentId", "firstName lastName email phone isActive")
        .lean(),
      ClassAttendanceModel.find({
        organizationId,
        sessionId: session._id
      }).lean()
    ]);

    const enrolledStudentIds = new Set(
      (enrollments as Array<any>).map((item) => String(item.studentId?._id ?? item.studentId))
    );

    const participants: Array<{
      studentId: string;
      student: any;
      participantType: "ENROLLMENT" | "TRIAL";
      enrollmentId?: string;
      trialId?: string;
      billingType: "PER_CLASS" | "MONTHLY" | "FREE";
    }> = [];

    for (const enrollment of enrollments as Array<any>) {
      if (!enrollment.studentId?.isActive) continue;
      participants.push({
        studentId: String(enrollment.studentId._id),
        student: enrollment.studentId,
        participantType: "ENROLLMENT",
        enrollmentId: String(enrollment._id),
        billingType: resolvedBillingPreference(
          danceClass as any,
          enrollment.billingPreference
        ) as "PER_CLASS" | "MONTHLY" | "FREE"
      });
    }

    for (const trial of trials as Array<any>) {
      const studentId = String(trial.studentId?._id ?? trial.studentId);
      if (!trial.studentId?.isActive || enrolledStudentIds.has(studentId)) continue;
      participants.push({
        studentId,
        student: trial.studentId,
        participantType: "TRIAL",
        trialId: String(trial._id),
        billingType: "FREE"
      });
    }

    const participantIds = participants.map(
      (item) => new Types.ObjectId(item.studentId)
    );

    const payments = participantIds.length
      ? await PaymentModel.find({
          organizationId,
          classId: session.classId,
          studentId: { $in: participantIds },
          status: { $ne: "CANCELLED" },
          $or: [
            {
              paymentType: "PER_CLASS",
              classDate: { $gte: start, $lt: end }
            },
            {
              paymentType: "MONTHLY",
              period
            }
          ]
        })
          .sort({ createdAt: -1 })
          .lean()
      : [];

    const attendanceMap = new Map(
      attendance.map((item) => [String(item.studentId), item.status])
    );
    const paymentMap = new Map<string, any>();

    for (const payment of payments as Array<any>) {
      const key = String(payment.studentId) + ":" + payment.paymentType;
      if (!paymentMap.has(key)) paymentMap.set(key, payment);
    }

    const billingMode = (danceClass as any).billingMode ?? "MONTHLY";
    const pricePerClass = (danceClass as any).pricePerClass ?? 0;
    const monthlyPrice = (danceClass as any).monthlyPrice ?? 0;

    const participantItems = participants.map((participant) => {
      const payment =
        participant.billingType === "FREE"
          ? null
          : paymentMap.get(participant.studentId + ":" + participant.billingType);

      const paymentStatus =
        participant.billingType === "FREE"
          ? "FREE"
          : payment
            ? effectivePaymentStatus(payment)
            : "NONE";

      return {
        studentId: participant.studentId,
        student: {
          firstName: participant.student.firstName,
          lastName: participant.student.lastName,
          email: participant.student.email,
          phone: participant.student.phone
        },
        participantType: participant.participantType,
        enrollmentId: participant.enrollmentId,
        trialId: participant.trialId,
        attendanceStatus: attendanceMap.get(participant.studentId) ?? "EXPECTED",
        billingType: participant.billingType,
        payment: {
          status: paymentStatus,
          paymentId: payment ? String(payment._id) : undefined,
          amount: payment?.amount ?? (
            participant.billingType === "PER_CLASS"
              ? pricePerClass
              : participant.billingType === "MONTHLY"
                ? monthlyPrice
                : 0
          ),
          paymentMethod: payment?.paymentMethod,
          receiptNumber: payment?.receiptNumber
        }
      };
    });

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
      participants: participantItems
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

    const { start, end } = utcDayRange(session.sessionDate);
    const [enrollment, trial] = await Promise.all([
      EnrollmentModel.exists({
        organizationId,
        classId: session.classId,
        studentId,
        status: "ACTIVE"
      }),
      TrialBookingModel.findOne({
        organizationId,
        classId: session.classId,
        studentId,
        status: "SCHEDULED",
        scheduledFor: { $gte: start, $lt: end }
      })
    ]);

    if (!enrollment && !trial) {
      throw new AppError(
        422,
        "El alumno no pertenece a esta clase del día",
        "STUDENT_NOT_IN_SESSION"
      );
    }

    const attendance = await ClassAttendanceModel.findOneAndUpdate(
      {
        organizationId,
        sessionId: session._id,
        studentId
      },
      {
        $set: {
          status,
          updatedByUserId: new Types.ObjectId(request.auth!.userId)
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (trial && status === "PRESENT") {
      trial.status = "COMPLETED";
      await trial.save();
    }

    await AuditLogModel.create({
      organizationId,
      actorUserId: request.auth!.userId,
      action: "CLASS_ATTENDANCE_UPDATED",
      entityType: "ClassAttendance",
      entityId: attendance._id,
      metadata: {
        sessionId: session._id,
        classId: session.classId,
        studentId,
        status
      }
    });

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
