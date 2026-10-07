import { Types } from "mongoose";
import { AppError } from "../../common/http/app-error";
import { academyNow } from "../../common/dates";
import { AuditLogModel } from "../audit/audit-log.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { effectivePaymentStatus } from "../payments/payment-status";
import { TrialBookingModel } from "../trials/trial-booking.model";
import {
  ATTENDANCE_STATUSES,
  ClassAttendanceModel,
  type AttendanceStatus,
  type ParticipantType
} from "./class-attendance.model";
import { billingModeOn } from "../enrollments/enrollment-validity";
import { StudentModel } from "../students/student.model";
import { sessionCoverage, type CoverageResult } from "../billing/coverage-service";
import { freezeIfEnded, freezeRoster, loadRoster } from "./roster-service";

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

export { effectivePaymentStatus };

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
  // Suspended and rescheduled sessions do not take place on this date either.
  if (["CANCELLED", "SUSPENDED", "RESCHEDULED"].includes(session.status)) return "CANCELLED";
  if (session.status === "COMPLETED") return "FINISHED";
  if (session.sessionDate < now.date) return "FINISHED";
  if (session.sessionDate > now.date) return "SCHEDULED";
  if (now.time >= session.endTime) return "FINISHED";
  if (now.time >= session.startTime) return "IN_PROGRESS";
  return "SCHEDULED";
}

export type SessionParticipant = {
  studentId: string;
  student: { firstName: string; lastName: string; email?: string; phone?: string };
  participantType: ParticipantType;
  enrollmentId?: string;
  trialId?: string;
  attendanceStatus: AttendanceStatus;
  billingType: BillingType;
  /** What covers this session financially (monthly fee, class fee or legacy payment). */
  payment: CoverageResult;
};

/** Roster of a session with per-participant billing, payment and attendance. */
export async function loadSessionParticipants(
  organizationId: string,
  session: SessionLike & { seriesId?: Types.ObjectId; rosterFrozenAt?: Date },
  danceClass: ClassLike
): Promise<SessionParticipant[]> {
  await freezeIfEnded(organizationId, session);
  const roster = await loadRoster(organizationId, session);
  if (!roster.length) return [];

  const studentIds = roster.map((item) => new Types.ObjectId(item.studentId));
  const enrollmentIds = roster.filter((item) => item.enrollmentId).map((item) => new Types.ObjectId(item.enrollmentId!));
  const [students, enrollments] = await Promise.all([
    StudentModel.find({ organizationId, _id: { $in: studentIds } }).select("firstName lastName email phone").lean<any[]>(),
    EnrollmentModel.find({ organizationId, _id: { $in: enrollmentIds } }).lean<any[]>()
  ]);
  const studentById = new Map(students.map((item) => [String(item._id), item]));
  const enrollmentById = new Map(enrollments.map((item) => [String(item._id), item]));

  const participants = roster
    .filter((item) => studentById.has(item.studentId))
    .map((item) => {
      const enrollment = item.enrollmentId ? enrollmentById.get(item.enrollmentId) : undefined;
      const billingType: BillingType =
        item.participantType === "TRIAL"
          ? "FREE"
          : resolvedBillingPreference(danceClass, enrollment ? billingModeOn(enrollment, session.sessionDate) : "PER_CLASS");
      return { ...item, student: studentById.get(item.studentId), billingType };
    });

  const coverage = await sessionCoverage(organizationId, session, danceClass, participants);

  return participants.map((participant) => {
    const covered = coverage.get(participant.studentId);
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
      attendanceStatus: participant.attendanceStatus,
      billingType: participant.billingType,
      payment: covered ?? {
        status: participant.billingType === "FREE" ? "FREE" : "NONE",
        paymentType: null,
        amount: expectedAmount(danceClass, participant.billingType),
        paidAmount: 0,
        balanceAmount: expectedAmount(danceClass, participant.billingType)
      }
    };
  });
}

/**
 * Records attendance of a student who is part of the session. Recording attendance freezes the
 * roster: from then on later enrollment changes do not alter who was in this class.
 * Caller must already have authorised the session.
 */
export async function setSessionAttendance(
  organizationId: string,
  session: SessionLike & { seriesId?: Types.ObjectId; rosterFrozenAt?: Date },
  studentId: string,
  status: AttendanceStatus,
  actorUserId: string
) {
  if (["CANCELLED", "SUSPENDED", "RESCHEDULED"].includes(session.status)) {
    throw new AppError(422, "La clase no se dicta en esta fecha", "SESSION_NOT_ACTIVE");
  }

  const roster = await loadRoster(organizationId, session);
  const participant = roster.find((item) => item.studentId === String(studentId));
  if (!participant) {
    throw new AppError(
      422,
      "El alumno no pertenece a esta clase del día",
      "STUDENT_NOT_IN_SESSION"
    );
  }

  await freezeRoster(organizationId, session);

  const attendance = await ClassAttendanceModel.findOneAndUpdate(
    { organizationId, sessionId: session._id, studentId },
    {
      $set: { status, updatedByUserId: new Types.ObjectId(actorUserId), recordedAt: new Date() },
      $setOnInsert: {
        participantType: participant.participantType,
        ...(participant.enrollmentId ? { enrollmentId: new Types.ObjectId(participant.enrollmentId) } : {}),
        ...(participant.trialId ? { trialId: new Types.ObjectId(participant.trialId) } : {})
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (participant.trialId && status === "PRESENT") {
    await TrialBookingModel.updateOne(
      { _id: participant.trialId, organizationId, status: "SCHEDULED" },
      { $set: { status: "COMPLETED" } }
    );
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
