import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AppError } from "../../common/http/app-error";
import { academyNow, addDays, dateRange } from "../../common/dates";
import { minutesBetween, weekBounds } from "../../common/schedule";
import { objectIdSchema } from "../admin/admin.schemas";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import {
  ATTENDANCE_STATUSES,
  ClassAttendanceModel
} from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import {
  ensureSessions,
  loadSessionParticipants,
  sessionPhase,
  setSessionAttendance
} from "../sessions/session-service";
import {
  branchNames,
  buildStudentOverview,
  enrollmentCounts,
  professorPaymentStatus,
  serializeClass,
  serializeSession,
  summarizeSessions
} from "./professor-data";
import {
  loadOwnedSession,
  loadOwnedStudent,
  loadProfessorContext,
  ownedClasses
} from "./professor-scope";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const calendarQuerySchema = z.object({ from: dateSchema, to: dateSchema });
const attendanceSchema = z.object({ status: z.enum(ATTENDANCE_STATUSES) });

const MAX_CALENDAR_DAYS = 62;
const HISTORY_WEEKS = 12;
const UPCOMING_DAYS = 28;

export const professorOperationsRouter = Router();

/** Sessions of the given classes in [from, to], materialised on demand. */
async function sessionsInRange(
  organizationId: string,
  classes: any[],
  from: string,
  to: string,
  options: { includeCancelled?: boolean } = {}
) {
  if (!classes.length) return [];
  await ensureSessions(organizationId, classes, from, to, { respectCreatedAt: true });
  return ClassSessionModel.find({
    organizationId,
    classId: { $in: classes.map((item) => item._id) },
    sessionDate: { $gte: from, $lte: to },
    ...(options.includeCancelled ? {} : { status: { $ne: "CANCELLED" } })
  })
    .sort({ sessionDate: 1, startTime: 1 })
    .lean<any[]>();
}

professorOperationsRouter.get("/dashboard", async (request, response, next) => {
  try {
    const context = await loadProfessorContext(request);
    const { organizationId, professor, user } = context;
    const now = academyNow();
    const week = weekBounds(now.date);

    const classes = await ownedClasses(context, { activeOnly: true });
    const classesById = new Map(classes.map((item) => [String(item._id), item]));
    const classIds = classes.map((item) => item._id as Types.ObjectId);

    const [counts, branches, sessions, students] = await Promise.all([
      enrollmentCounts(organizationId, classIds),
      branchNames(organizationId, classes),
      sessionsInRange(organizationId, classes, week.from, addDays(now.date, 14)),
      buildStudentOverview(context, classes)
    ]);

    const todaySessionsRaw = sessions.filter((item) => item.sessionDate === now.date);
    const summaries = await summarizeSessions(organizationId, todaySessionsRaw, classesById);

    const toItem = (session: any) =>
      serializeSession(session, classesById.get(String(session.classId)), {
        branchName: branches.get(String(classesById.get(String(session.classId)).branchId)),
        enrolledCount: counts.get(String(session.classId)) ?? 0,
        summary: summaries.get(String(session._id))
      });

    const todaySessions = todaySessionsRaw.map(toItem);
    const upcoming = sessions.find((item) => sessionPhase(item, now) !== "FINISHED");
    const nextSession = upcoming ? toItem(upcoming) : null;
    const nextSummary =
      upcoming && !summaries.has(String(upcoming._id))
        ? (await summarizeSessions(organizationId, [upcoming], classesById)).get(String(upcoming._id))
        : undefined;
    if (nextSession && nextSummary) nextSession.summary = nextSummary;

    const pendingStudents = students.filter(
      (item) => item.financialStatus === "PENDING" || item.financialStatus === "OVERDUE"
    );
    const missedStudents = students.filter((item) => item.lastAttendance?.status === "ABSENT");

    const finishedToday = todaySessionsRaw.filter((item) => sessionPhase(item, now) === "FINISHED");
    const attendanceRows = finishedToday.length
      ? await ClassAttendanceModel.find({
          organizationId,
          sessionId: { $in: finishedToday.map((item) => item._id) },
          status: { $in: ["PRESENT", "ABSENT"] }
        })
          .select("sessionId")
          .lean<any[]>()
      : [];
    const recordedSessions = new Set(attendanceRows.map((item) => String(item.sessionId)));
    const unrecorded = finishedToday.filter(
      (item) =>
        item.status !== "COMPLETED" &&
        !recordedSessions.has(String(item._id)) &&
        (counts.get(String(item.classId)) ?? 0) > 0
    );

    const alerts: Array<{
      id: string;
      type: string;
      tone: "warning" | "danger" | "info";
      message: string;
      count: number;
      href: string;
    }> = [];
    if (unrecorded.length) {
      alerts.push({
        id: "unrecorded-attendance",
        type: "ATTENDANCE_PENDING",
        tone: "warning",
        count: unrecorded.length,
        message:
          unrecorded.length === 1
            ? "1 clase de hoy terminó sin asistencia cargada"
            : `${unrecorded.length} clases de hoy terminaron sin asistencia cargada`,
        href: `/professor/sessions/${unrecorded[0]._id}`
      });
    }
    if (pendingStudents.length) {
      alerts.push({
        id: "pending-payments",
        type: "PAYMENTS_PENDING",
        tone: pendingStudents.some((item) => item.financialStatus === "OVERDUE") ? "danger" : "warning",
        count: pendingStudents.length,
        message:
          pendingStudents.length === 1
            ? "1 alumno con pago pendiente"
            : `${pendingStudents.length} alumnos con pago pendiente`,
        href: "/professor/students?payment=PENDING"
      });
    }
    if (missedStudents.length) {
      alerts.push({
        id: "missed-last-class",
        type: "ABSENCES",
        tone: "info",
        count: missedStudents.length,
        message:
          missedStudents.length === 1
            ? "1 alumno faltó a su última clase"
            : `${missedStudents.length} alumnos faltaron a su última clase`,
        href: "/professor/students?attendance=ABSENT"
      });
    }

    // Specialties: the profile's disciplines plus the ones of the classes actually taught.
    const specialties = new Map<string, { id: string; name: string }>();
    for (const item of professor.disciplineIds ?? []) {
      specialties.set(String(item._id), { id: String(item._id), name: item.name });
    }
    for (const danceClass of classes) {
      for (const item of danceClass.disciplineIds ?? []) {
        specialties.set(String(item._id), { id: String(item._id), name: item.name });
      }
    }

    response.json({
      today: now.date,
      now: now.time,
      professor: {
        id: professor.id,
        displayName: professor.displayName,
        firstName: user.firstName,
        avatarUrl: professor.avatarUrl ?? "",
        specialties: [...specialties.values()]
      },
      nextSession,
      todaySessions,
      stats: {
        activeClasses: classes.length,
        classesToday: todaySessions.filter((item) => item.phase !== "CANCELLED").length,
        classesThisWeek: sessions.filter(
          (item) => item.sessionDate >= week.from && item.sessionDate <= week.to
        ).length,
        activeStudents: students.length,
        pendingPayments: pendingStudents.length
      },
      alerts
    });
  } catch (error) {
    next(error);
  }
});

professorOperationsRouter.get("/calendar", async (request, response, next) => {
  try {
    const { from, to } = calendarQuerySchema.parse(request.query);
    if (to < from || dateRange(from, to).length > MAX_CALENDAR_DAYS) {
      throw new AppError(422, "Rango de fechas inválido", "INVALID_DATE_RANGE");
    }

    const context = await loadProfessorContext(request);
    const classes = await ownedClasses(context, { activeOnly: true });
    const classesById = new Map(classes.map((item) => [String(item._id), item]));

    const [sessions, counts, branches] = await Promise.all([
      sessionsInRange(context.organizationId, classes, from, to, { includeCancelled: true }),
      enrollmentCounts(context.organizationId, classes.map((item) => item._id)),
      branchNames(context.organizationId, classes)
    ]);

    response.json({
      from,
      to,
      today: academyNow().date,
      items: sessions.map((session) => {
        const danceClass = classesById.get(String(session.classId));
        return serializeSession(session, danceClass, {
          branchName: branches.get(String(danceClass.branchId)),
          enrolledCount: counts.get(String(session.classId)) ?? 0
        });
      })
    });
  } catch (error) {
    next(error);
  }
});

professorOperationsRouter.get("/classes", async (request, response, next) => {
  try {
    const context = await loadProfessorContext(request);
    const classes = await ownedClasses(context);
    const [counts, branches] = await Promise.all([
      enrollmentCounts(context.organizationId, classes.map((item) => item._id)),
      branchNames(context.organizationId, classes)
    ]);
    const now = academyNow();

    response.json({
      items: classes.map((danceClass) =>
        serializeClass(danceClass, {
          enrolledCount: counts.get(String(danceClass._id)) ?? 0,
          branchName: branches.get(String(danceClass.branchId)),
          now
        })
      )
    });
  } catch (error) {
    next(error);
  }
});

professorOperationsRouter.get("/classes/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const context = await loadProfessorContext(request);
    const [danceClass] = await ownedClasses(context, { classId: id });
    if (!danceClass) {
      throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
    }

    const now = academyNow();
    const classesById = new Map([[String(danceClass._id), danceClass]]);
    const [counts, branches, sessions, overview] = await Promise.all([
      enrollmentCounts(context.organizationId, [danceClass._id]),
      branchNames(context.organizationId, [danceClass]),
      sessionsInRange(
        context.organizationId,
        [danceClass],
        addDays(now.date, -HISTORY_WEEKS * 7),
        addDays(now.date, UPCOMING_DAYS),
        { includeCancelled: true }
      ),
      buildStudentOverview(context, [danceClass])
    ]);

    const branchName = branches.get(String(danceClass.branchId));
    const enrolledCount = counts.get(id) ?? 0;
    const summaries = await summarizeSessions(context.organizationId, sessions, classesById);
    const toItem = (session: any) =>
      serializeSession(session, danceClass, {
        branchName,
        enrolledCount,
        summary: summaries.get(String(session._id))
      });

    const items = sessions.map(toItem);
    const isUpcoming = (item: (typeof items)[number]) =>
      item.phase === "SCHEDULED" ||
      item.phase === "IN_PROGRESS" ||
      (item.phase === "CANCELLED" && item.date >= now.date);
    const upcoming = items.filter(isUpcoming);
    const history = items.filter((item) => !isUpcoming(item)).reverse();

    response.json({
      class: serializeClass(danceClass, { enrolledCount, branchName, now }),
      upcoming,
      history,
      students: overview.map((student) => ({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        enrollment: student.enrollments[0],
        lastAttendance: student.lastAttendance
      }))
    });
  } catch (error) {
    next(error);
  }
});

professorOperationsRouter.get("/sessions/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const context = await loadProfessorContext(request);
    const { session, danceClass } = await loadOwnedSession(context, id);

    const [participants, branches, counts] = await Promise.all([
      loadSessionParticipants(context.organizationId, session, danceClass),
      branchNames(context.organizationId, [danceClass]),
      enrollmentCounts(context.organizationId, [danceClass._id])
    ]);

    const roster = participants.map((item) => ({
      studentId: item.studentId,
      student: item.student,
      participantType: item.participantType,
      billingType: item.billingType,
      attendanceStatus: item.attendanceStatus,
      payment: {
        status:
          item.billingType === "FREE"
            ? "FREE"
            : item.payment.status === "PAID"
              ? "PAID"
              : item.payment.status === "OVERDUE"
                ? "OVERDUE"
                : "PENDING",
        amount: item.payment.amount,
        reference:
          item.billingType === "FREE"
            ? null
            : (item.payment.paymentType ?? item.billingType) === "MONTHLY"
              ? { kind: "MONTH", value: session.sessionDate.slice(0, 7) }
              : { kind: "CLASS", value: session.sessionDate }
      }
    }));

    const count = (predicate: (item: (typeof roster)[number]) => boolean) =>
      roster.filter(predicate).length;

    response.json({
      ...serializeSession(session, danceClass, {
        branchName: branches.get(String(danceClass.branchId)),
        enrolledCount: counts.get(String(danceClass._id)) ?? 0
      }),
      professor: { displayName: context.professor.displayName },
      durationMinutes: minutesBetween(session.startTime, session.endTime),
      summary: {
        students: roster.length,
        paid: count((item) => item.payment.status === "PAID"),
        pending: count((item) => item.payment.status === "PENDING" || item.payment.status === "OVERDUE"),
        free: count((item) => item.payment.status === "FREE"),
        present: count((item) => item.attendanceStatus === "PRESENT"),
        absent: count((item) => item.attendanceStatus === "ABSENT")
      },
      roster
    });
  } catch (error) {
    next(error);
  }
});

professorOperationsRouter.patch(
  "/sessions/:id/attendance/:studentId",
  async (request, response, next) => {
    try {
      const id = objectIdSchema.parse(request.params.id);
      const studentId = objectIdSchema.parse(request.params.studentId);
      const { status } = attendanceSchema.parse(request.body);
      const context = await loadProfessorContext(request);
      const { session } = await loadOwnedSession(context, id);

      if (session.status === "CANCELLED") {
        throw new AppError(422, "La clase está cancelada", "SESSION_CANCELLED");
      }

      const attendance = await setSessionAttendance(
        context.organizationId,
        session,
        studentId,
        status,
        context.userId
      );

      response.json({ studentId, status: attendance.status });
    } catch (error) {
      next(error);
    }
  }
);

professorOperationsRouter.get("/students", async (request, response, next) => {
  try {
    const context = await loadProfessorContext(request);
    const classes = await ownedClasses(context);
    const rows = await buildStudentOverview(context, classes);

    response.json({
      classes: classes.map((item) => ({ id: String(item._id), name: item.name })),
      items: rows
    });
  } catch (error) {
    next(error);
  }
});

professorOperationsRouter.get("/students/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const context = await loadProfessorContext(request);
    const { student, classes, enrollments } = await loadOwnedStudent(context, id);

    const overview = (await buildStudentOverview(context, classes)).find(
      (item) => item.id === String(student._id)
    );
    const classIds = classes.map((item) => item._id as Types.ObjectId);
    const classNames = new Map(classes.map((item) => [String(item._id), item.name as string]));

    const [payments, sessions] = await Promise.all([
      PaymentModel.find({
        organizationId: context.organizationId,
        studentId: student._id,
        classId: { $in: classIds },
        status: { $ne: "CANCELLED" }
      })
        .sort({ classDate: -1, dueDate: -1 })
        .limit(60)
        .select("classId paymentType classDate period concept amount status dueDate")
        .lean<any[]>(),
      ClassSessionModel.find({
        organizationId: context.organizationId,
        classId: { $in: classIds },
        sessionDate: { $lte: academyNow().date }
      })
        .select("classId sessionDate startTime")
        .lean<any[]>()
    ]);

    const sessionMap = new Map(sessions.map((item) => [String(item._id), item]));
    const records = sessions.length
      ? await ClassAttendanceModel.find({
          organizationId: context.organizationId,
          studentId: student._id,
          sessionId: { $in: sessions.map((item) => item._id) },
          status: { $in: ["PRESENT", "ABSENT"] }
        })
          .select("sessionId status")
          .lean<any[]>()
      : [];

    const attendance = records
      .map((record) => {
        const session = sessionMap.get(String(record.sessionId));
        return {
          date: session.sessionDate as string,
          startTime: session.startTime as string,
          className: classNames.get(String(session.classId)) ?? "",
          status: record.status as "PRESENT" | "ABSENT"
        };
      })
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

    response.json({
      student: {
        id: String(student._id),
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email ?? "",
        phone: student.phone ?? "",
        isActive: student.isActive
      },
      enrollments: overview?.enrollments ?? [],
      financialStatus: overview?.financialStatus ?? "FREE",
      payments: payments.map((payment) => ({
        id: String(payment._id),
        classId: String(payment.classId),
        className: classNames.get(String(payment.classId)) ?? "",
        type: payment.paymentType,
        date: payment.classDate
          ? payment.classDate.toISOString().slice(0, 10)
          : payment.dueDate.toISOString().slice(0, 10),
        period: payment.period,
        concept: payment.concept,
        amount: payment.amount,
        status: professorPaymentStatus(payment.paymentType, payment)
      })),
      attendance: {
        totals: {
          classes: attendance.length,
          present: attendance.filter((item) => item.status === "PRESENT").length,
          absent: attendance.filter((item) => item.status === "ABSENT").length
        },
        recent: attendance.slice(0, 20)
      },
      enrolledSince: enrollments.reduce<Date | undefined>(
        (min, item) => (!min || item.enrolledAt < min ? item.enrolledAt : min),
        undefined
      )
    });
  } catch (error) {
    next(error);
  }
});
