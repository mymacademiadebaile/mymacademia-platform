import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import {
  academyDateOf,
  academyNow,
  dateRange,
  utcDayRange,
  weekDayFor
} from "../../common/dates";
import { AuditLogModel } from "../audit/audit-log.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { PaymentModel } from "../payments/payment.model";
import { TrialBookingModel } from "../trials/trial-booking.model";
import {
  ATTENDANCE_STATUSES,
  ClassAttendanceModel,
  type AttendanceStatus
} from "./class-attendance.model";
import { ClassSessionModel } from "./class-session.model";

export type BillingType = "PER_CLASS" | "MONTHLY" | "FREE";
export type SessionPhase = "SCHEDULED" | "IN_PROGRESS" | "FINISHED" | "CANCELLED";

export { ATTENDANCE_STATUSES };
export type { AttendanceStatus };

interface ClassLike {
  _id: Types.ObjectId;
  branchId: Types.ObjectId;
  billingMode?: string;
  pricePerClass?: number;
  monthlyPrice?: number;
  schedules?: Array<{ day: string; startTime: string; endTime: string }>;
  createdAt?: Date;
}

interface SessionLike {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

export function effectivePaymentStatus(payment: { status: string; dueDate: Date }) {
  if (payment.status === "PENDING" && payment.dueDate.getTime() < Date.now()) {
    return "OVERDUE";
  }
  return payment.status;
}

/** Which billing rule applies to an enrollment. Single source of truth for Admin and Professor. */
export function resolvedBillingPreference(
  danceClass: { billingMode?: string },
  preference?: string
): BillingType {
  const mode = danceClass.billingMode ?? "MONTHLY";
  if (mode === "FREE") return "FREE";
  if (mode === "PER_CLASS") return "PER_CLASS";
  if (mode === "MONTHLY") return "MONTHLY";
  return preference === "MONTHLY" ? "MONTHLY" : "PER_CLASS";
}

export type SessionPaymentStatus = "FREE" | "PAID" | "OVERDUE" | "PENDING" | "NONE";

export interface CoveragePayment {
  _id?: unknown;
  paymentType: string;
  status: string;
  dueDate: Date;
  createdAt?: Date;
}

const COVERAGE_RANK: Record<string, number> = { PAID: 0, OVERDUE: 1, PENDING: 2 };

/**
 * Financial state of one session for one student, from the Payments that really cover it
 * (PER_CLASS of that day, MONTHLY of that month), whatever the current billing preference is.
 * Enrollment.billingPreference is only the present/future rule; Payment.paymentType is history.
 * CANCELLED payments never cover. Representative payment, deterministic:
 * PAID > OVERDUE > PENDING; ties prefer the payment of the current billingType, then the most
 * recent createdAt, then the highest _id. FREE classes owe nothing and expose no payment.
 */
export function resolveSessionPaymentCoverage<P extends CoveragePayment>(
  billingType: BillingType,
  payments: P[]
): { status: SessionPaymentStatus; payment: P | null; paymentType: "PER_CLASS" | "MONTHLY" | null } {
  if (billingType === "FREE") return { status: "FREE", payment: null, paymentType: null };

  const time = (payment: P) => payment.createdAt?.getTime() ?? 0;
  const candidates = payments
    .filter((payment) => payment.status !== "CANCELLED")
    .map((payment) => ({ payment, status: effectivePaymentStatus(payment) }))
    .filter((item) => item.status in COVERAGE_RANK)
    .sort(
      (a, b) =>
        COVERAGE_RANK[a.status]! - COVERAGE_RANK[b.status]! ||
        Number(b.payment.paymentType === billingType) - Number(a.payment.paymentType === billingType) ||
        time(b.payment) - time(a.payment) ||
        String(b.payment._id ?? "").localeCompare(String(a.payment._id ?? ""))
    );

  const best = candidates[0];
  if (!best) return { status: "NONE", payment: null, paymentType: null };

  return {
    status: best.status as SessionPaymentStatus,
    payment: best.payment,
    paymentType: best.payment.paymentType as "PER_CLASS" | "MONTHLY"
  };
}

export function expectedAmount(danceClass: ClassLike, billingType: BillingType) {
  if (billingType === "PER_CLASS") return danceClass.pricePerClass ?? 0;
  if (billingType === "MONTHLY") return danceClass.monthlyPrice ?? 0;
  return 0;
}

/**
 * Wall-clock phase of a session in Argentina. Cancelled and completed sessions
 * keep their persisted state; scheduled ones are derived from date and time.
 */
export function sessionPhase(
  session: { sessionDate: string; startTime: string; endTime: string; status: string },
  now = academyNow()
): SessionPhase {
  if (session.status === "CANCELLED") return "CANCELLED";
  if (session.status === "COMPLETED") return "FINISHED";
  if (session.sessionDate < now.date) return "FINISHED";
  if (session.sessionDate > now.date) return "SCHEDULED";
  if (now.time >= session.endTime) return "FINISHED";
  if (now.time >= session.startTime) return "IN_PROGRESS";
  return "SCHEDULED";
}

/** Creates the ClassSession rows for every schedule occurrence in [from, to]. */
export async function ensureSessions(
  organizationId: string,
  classes: ClassLike[],
  from: string,
  to: string,
  options: { respectCreatedAt?: boolean } = {}
) {
  const organizationObjectId = new Types.ObjectId(organizationId);
  const dates = dateRange(from, to);
  const operations: Array<Record<string, unknown>> = [];

  for (const danceClass of classes) {
    const createdKey =
      options.respectCreatedAt && danceClass.createdAt
        ? academyDateOf(danceClass.createdAt)
        : undefined;

    for (const date of dates) {
      if (createdKey && date < createdKey) continue;
      const day = weekDayFor(date);
      for (const schedule of danceClass.schedules ?? []) {
        if (schedule.day !== day) continue;
        operations.push({
          updateOne: {
            filter: {
              organizationId: organizationObjectId,
              classId: danceClass._id,
              sessionDate: date,
              startTime: schedule.startTime
            },
            update: {
              $setOnInsert: {
                organizationId: organizationObjectId,
                branchId: danceClass.branchId,
                classId: danceClass._id,
                sessionDate: date,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                status: "SCHEDULED"
              }
            },
            upsert: true
          }
        });
      }
    }
  }

  if (operations.length > 0) {
    await ClassSessionModel.bulkWrite(operations as never);
  }
}

export type SessionParticipant = {
  studentId: string;
  student: { firstName: string; lastName: string; email?: string; phone?: string };
  participantType: "ENROLLMENT" | "TRIAL";
  enrollmentId?: string;
  trialId?: string;
  attendanceStatus: AttendanceStatus;
  billingType: BillingType;
  payment: {
    status: string;
    paymentId?: string;
    /** Type of the Payment that covers this session (may differ from billingType); null if none. */
    paymentType: "PER_CLASS" | "MONTHLY" | null;
    amount: number;
    paymentMethod?: string;
    receiptNumber?: string;
  };
};

/** Roster of a session with per-participant billing, payment and attendance. */
export async function loadSessionParticipants(
  organizationId: string,
  session: SessionLike,
  danceClass: ClassLike
): Promise<SessionParticipant[]> {
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
      status: { $in: ["SCHEDULED", "COMPLETED"] },
      scheduledFor: { $gte: start, $lt: end }
    })
      .populate("studentId", "firstName lastName email phone isActive")
      .lean(),
    ClassAttendanceModel.find({ organizationId, sessionId: session._id }).lean()
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
    billingType: BillingType;
  }> = [];

  for (const enrollment of enrollments as Array<any>) {
    if (!enrollment.studentId?.isActive) continue;
    participants.push({
      studentId: String(enrollment.studentId._id),
      student: enrollment.studentId,
      participantType: "ENROLLMENT",
      enrollmentId: String(enrollment._id),
      billingType: resolvedBillingPreference(danceClass, enrollment.billingPreference)
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

  const participantIds = participants.map((item) => new Types.ObjectId(item.studentId));

  const payments = participantIds.length
    ? await PaymentModel.find({
        organizationId,
        classId: session.classId,
        studentId: { $in: participantIds },
        status: { $ne: "CANCELLED" },
        $or: [
          { paymentType: "PER_CLASS", classDate: { $gte: start, $lt: end } },
          { paymentType: "MONTHLY", period }
        ]
      })
        .sort({ createdAt: -1 })
        .lean()
    : [];

  const attendanceMap = new Map(
    attendance.map((item) => [String(item.studentId), item.status])
  );
  // One query for everyone; grouped per student in memory (no per-student queries).
  const paymentsByStudent = new Map<string, any[]>();
  for (const payment of payments as Array<any>) {
    const key = String(payment.studentId);
    paymentsByStudent.set(key, [...(paymentsByStudent.get(key) ?? []), payment]);
  }

  return participants.map((participant) => {
    const coverage = resolveSessionPaymentCoverage(
      participant.billingType,
      paymentsByStudent.get(participant.studentId) ?? []
    );
    const payment = coverage.payment;
    const paymentStatus = coverage.status;

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
        paymentType: coverage.paymentType,
        amount: payment?.amount ?? expectedAmount(danceClass, participant.billingType),
        paymentMethod: payment?.paymentMethod,
        receiptNumber: payment?.receiptNumber
      }
    };
  });
}

/** Marks attendance for a student of a session. Caller must already have authorised the session. */
export async function setSessionAttendance(
  organizationId: string,
  session: SessionLike,
  studentId: string,
  status: AttendanceStatus,
  actorUserId: string
) {
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
      status: { $in: ["SCHEDULED", "COMPLETED"] },
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
    { organizationId, sessionId: session._id, studentId },
    { $set: { status, updatedByUserId: new Types.ObjectId(actorUserId) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (trial && status === "PRESENT") {
    trial.status = "COMPLETED";
    await trial.save();
  }

  await AuditLogModel.create({
    organizationId,
    actorUserId,
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

  return attendance;
}
