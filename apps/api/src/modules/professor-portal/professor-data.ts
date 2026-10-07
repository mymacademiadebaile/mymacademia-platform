import { Types } from "mongoose";
import { academyNow, addDays } from "../../common/dates";
import {
  lastOccurrence,
  minutesBetween,
  nextOccurrence,
  type Occurrence
} from "../../common/schedule";
import { BranchModel } from "../core/branch.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { loadCoverageViews, pickCoverage } from "../billing/coverage-service";
import { billingModeOn } from "../enrollments/enrollment-validity";
import { rosterBatch } from "../sessions/roster-service";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import {
  expectedAmount,
  resolvedBillingPreference,
  sessionPhase,
  type BillingType
} from "../sessions/session-service";
import { StudentModel } from "../students/student.model";
import type { ProfessorContext } from "./professor-scope";

/** Payment states the professor sees. NONE (no Payment row yet) is shown as pending. */
export type ProfessorPaymentStatus = "PAID" | "PENDING" | "OVERDUE" | "FREE";

/**
 * What the professor sees of a coverage status. Professors never see amounts owed in total,
 * only whether the student is up to date for that class.
 */
export function professorPaymentStatus(billingType: BillingType, status?: string | null): ProfessorPaymentStatus {
  if (billingType === "FREE" || status === "FREE") return "FREE";
  if (status === "PAID") return "PAID";
  if (status === "OVERDUE") return "OVERDUE";
  return "PENDING";
}

const namedItem = (item: any) => ({ id: String(item._id), name: item.name });

export async function branchNames(organizationId: string, classes: any[]) {
  const ids = [...new Set(classes.map((item) => String(item.branchId)))];
  const branches = ids.length
    ? await BranchModel.find({ organizationId, _id: { $in: ids } })
        .select("name address")
        .lean<any[]>()
    : [];
  return new Map(branches.map((item) => [String(item._id), item.name as string]));
}

export async function enrollmentCounts(organizationId: string, classIds: Types.ObjectId[]) {
  if (!classIds.length) return new Map<string, number>();
  // Students who left the academy keep no seat even before their enrollment is closed.
  const rows = await EnrollmentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        organizationId: new Types.ObjectId(organizationId),
        classId: { $in: classIds },
        status: "ACTIVE"
      }
    },
    { $lookup: { from: "students", localField: "studentId", foreignField: "_id", as: "student" } },
    { $match: { "student.isActive": { $ne: false } } },
    { $group: { _id: "$classId", count: { $sum: 1 } } }
  ]);
  return new Map(rows.map((item) => [String(item._id), item.count]));
}

export function serializeClass(
  danceClass: any,
  extras: { enrolledCount: number; branchName?: string; now?: { date: string; time: string } }
) {
  const next = nextOccurrence(danceClass.schedules ?? [], extras.now ?? academyNow());
  return {
    id: String(danceClass._id),
    name: danceClass.name,
    status: danceClass.status,
    disciplines: (danceClass.disciplineIds ?? []).map(namedItem),
    segments: (danceClass.segmentIds ?? []).map(namedItem),
    levels: (danceClass.levelIds ?? []).map(namedItem),
    branch: { id: String(danceClass.branchId), name: extras.branchName ?? "" },
    schedules: (danceClass.schedules ?? []).map((slot: any) => ({
      day: slot.day,
      startTime: slot.startTime,
      endTime: slot.endTime
    })),
    capacity: danceClass.capacity,
    enrolledCount: extras.enrolledCount,
    billingMode: danceClass.billingMode ?? "MONTHLY",
    pricePerClass: danceClass.pricePerClass ?? 0,
    monthlyPrice: danceClass.monthlyPrice ?? 0,
    freeTrialEnabled: Boolean(danceClass.freeTrialEnabled),
    nextOccurrence: next ?? null
  };
}

export type SessionSummary = {
  enrolled: number;
  paid: number;
  pending: number;
  overdue: number;
  free: number;
  present: number;
  absent: number;
  expected: number;
};

const emptySummary = (): SessionSummary => ({
  enrolled: 0,
  paid: 0,
  pending: 0,
  overdue: 0,
  free: 0,
  present: 0,
  absent: 0,
  expected: 0
});

/**
 * Batch summary for many sessions: the same roster and coverage rules as the session screen
 * (rosterBatch + pickCoverage), with a fixed number of queries.
 */
export async function summarizeSessions(
  organizationId: string,
  sessions: any[],
  classesById: Map<string, any>
) {
  const summaries = new Map<string, SessionSummary>();
  if (!sessions.length) return summaries;

  const rosters = await rosterBatch(organizationId, sessions);
  const entries = [...rosters.values()].flat();
  const enrollmentIds = [...new Set(entries.map((item) => item.enrollmentId).filter(Boolean))] as string[];
  const enrollments = enrollmentIds.length
    ? await EnrollmentModel.find({ organizationId, _id: { $in: enrollmentIds } }).lean<any[]>()
    : [];
  const enrollmentById = new Map(enrollments.map((item) => [String(item._id), item]));
  const sessionIds = sessions.flatMap((item) => [item._id, item.rescheduledFromSessionId].filter(Boolean));
  const loaded = await loadCoverageViews(organizationId, {
    classIds: [...new Set(sessions.map((item) => String(item.classId)))].map((id) => new Types.ObjectId(id)),
    studentIds: [...new Set(entries.map((item) => item.studentId))].map((id) => new Types.ObjectId(id)),
    periods: [...new Set(sessions.map((item) => item.sessionDate.slice(0, 7)))],
    sessionIds,
    days: sessions.map((item) => item.sessionDate)
  });

  for (const session of sessions) {
    const danceClass = classesById.get(String(session.classId)) ?? {};
    const summary = emptySummary();
    for (const entry of rosters.get(String(session._id)) ?? []) {
      summary.enrolled += 1;
      const enrollment = entry.enrollmentId ? enrollmentById.get(entry.enrollmentId) : undefined;
      const billingType: BillingType =
        entry.participantType === "TRIAL"
          ? "FREE"
          : resolvedBillingPreference(danceClass, enrollment ? billingModeOn(enrollment, session.sessionDate) : "PER_CLASS");
      const coverage = pickCoverage(loaded, {
        studentId: entry.studentId,
        classId: String(session.classId),
        billingType,
        period: session.sessionDate.slice(0, 7),
        sessionIds: [session._id, session.rescheduledFromSessionId].filter(Boolean).map(String),
        days: [session.sessionDate],
        listPrice: expectedAmount(danceClass, billingType)
      });
      const status = professorPaymentStatus(billingType, coverage.status);
      if (status === "PAID") summary.paid += 1;
      else if (status === "OVERDUE") summary.overdue += 1;
      else if (status === "FREE") summary.free += 1;
      else summary.pending += 1;

      if (entry.attendanceStatus === "PRESENT") summary.present += 1;
      else if (entry.attendanceStatus === "ABSENT") summary.absent += 1;
      else summary.expected += 1;
    }
    summaries.set(String(session._id), summary);
  }

  return summaries;
}

export function serializeSession(
  session: any,
  danceClass: any,
  extras: { branchName?: string; enrolledCount: number; summary?: SessionSummary; professors?: string[] }
) {
  return {
    id: String(session._id),
    date: session.sessionDate,
    startTime: session.startTime,
    endTime: session.endTime,
    durationMinutes: minutesBetween(session.startTime, session.endTime),
    persistedStatus: session.status,
    phase: sessionPhase(session),
    class: {
      id: String(danceClass._id),
      name: danceClass.name,
      disciplines: (danceClass.disciplineIds ?? []).map(namedItem),
      segments: (danceClass.segmentIds ?? []).map(namedItem),
      levels: (danceClass.levelIds ?? []).map(namedItem),
      branch: { id: String(danceClass.branchId), name: extras.branchName ?? "" },
      capacity: danceClass.capacity,
      billingMode: danceClass.billingMode ?? "MONTHLY",
      pricePerClass: danceClass.pricePerClass ?? 0,
      monthlyPrice: danceClass.monthlyPrice ?? 0
    },
    enrolledCount: extras.enrolledCount,
    summary: extras.summary
  };
}

export type StudentEnrollmentRow = {
  enrollmentId: string;
  classId: string;
  className: string;
  disciplines: string[];
  segments: string[];
  levels: string[];
  billingType: BillingType;
  paymentStatus: ProfessorPaymentStatus;
  amount: number;
  reference: { kind: "CLASS" | "MONTH"; value: string } | null;
  enrolledAt: Date;
};

export type StudentOverviewRow = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  enrollments: StudentEnrollmentRow[];
  financialStatus: ProfessorPaymentStatus;
  lastAttendance: { status: "PRESENT" | "ABSENT"; date: string; className: string } | null;
};

const severity: Record<ProfessorPaymentStatus, number> = {
  OVERDUE: 3,
  PENDING: 2,
  PAID: 1,
  FREE: 0
};

/**
 * One row per student of the professor. The financial status of each enrollment is
 * evaluated against the class' most recent occurrence (or the next one if none yet):
 * PER_CLASS looks at that exact date, MONTHLY at that date's month, FREE never owes.
 */
export async function buildStudentOverview(
  context: ProfessorContext,
  classes: any[]
): Promise<StudentOverviewRow[]> {
  const { organizationId } = context;
  const classIds = classes.map((item) => item._id as Types.ObjectId);
  if (!classIds.length) return [];

  const now = academyNow();
  const classesById = new Map(classes.map((item) => [String(item._id), item]));

  const enrollments = await EnrollmentModel.find({
    organizationId,
    classId: { $in: classIds },
    status: "ACTIVE"
  }).lean<any[]>();
  if (!enrollments.length) return [];

  const studentIds = [...new Set(enrollments.map((item) => String(item.studentId)))];
  const students = await StudentModel.find({
    organizationId,
    _id: { $in: studentIds },
    isActive: true
  })
    .select("firstName lastName email phone")
    .sort({ lastName: 1, firstName: 1 })
    .lean<any[]>();
  const studentMap = new Map(students.map((item) => [String(item._id), item]));

  const referenceByClass = new Map<string, Occurrence | undefined>();
  for (const danceClass of classes) {
    referenceByClass.set(
      String(danceClass._id),
      lastOccurrence(danceClass.schedules ?? [], now) ??
        nextOccurrence(danceClass.schedules ?? [], now)
    );
  }
  const referenceDates = [...referenceByClass.values()]
    .filter((item): item is Occurrence => Boolean(item))
    .map((item) => item.date)
    .sort();

  const historyFrom = addDays(now.date, -120);
  const referencePeriods = [...new Set(referenceDates.map((date) => date.slice(0, 7)))];
  const [sessions, referenceSessions] = await Promise.all([
    ClassSessionModel.find({
      organizationId,
      classId: { $in: classIds },
      sessionDate: { $gte: historyFrom, $lte: now.date }
    })
      .select("classId sessionDate")
      .lean<any[]>(),
    referenceDates.length
      ? ClassSessionModel.find({ organizationId, classId: { $in: classIds }, sessionDate: { $in: referenceDates } })
          .select("_id classId sessionDate")
          .lean<any[]>()
      : Promise.resolve([] as any[])
  ]);
  const loaded = await loadCoverageViews(organizationId, {
    classIds,
    studentIds: studentIds.map((id) => new Types.ObjectId(id)),
    periods: referencePeriods,
    sessionIds: referenceSessions.map((item) => item._id),
    days: referenceDates
  });

  const attendance = sessions.length
    ? await ClassAttendanceModel.find({
        organizationId,
        sessionId: { $in: sessions.map((item) => item._id) },
        studentId: { $in: studentIds },
        status: { $in: ["PRESENT", "ABSENT"] }
      })
        .select("sessionId studentId status")
        .lean<any[]>()
    : [];

  const sessionMap = new Map(sessions.map((item) => [String(item._id), item]));
  const lastAttendance = new Map<string, StudentOverviewRow["lastAttendance"]>();
  for (const record of attendance) {
    const session = sessionMap.get(String(record.sessionId));
    if (!session) continue;
    const key = String(record.studentId);
    const current = lastAttendance.get(key);
    if (!current || session.sessionDate > current.date) {
      lastAttendance.set(key, {
        status: record.status,
        date: session.sessionDate,
        className: classesById.get(String(session.classId))?.name ?? ""
      });
    }
  }

  const rows = new Map<string, StudentOverviewRow>();
  for (const enrollment of enrollments) {
    const student = studentMap.get(String(enrollment.studentId));
    const danceClass = classesById.get(String(enrollment.classId));
    if (!student || !danceClass) continue;

    const reference = referenceByClass.get(String(danceClass._id));
    const billingType = resolvedBillingPreference(
      danceClass,
      reference ? billingModeOn(enrollment, reference.date) : enrollment.billingPreference
    );
    const when = reference
      ? billingType === "MONTHLY"
        ? reference.date.slice(0, 7)
        : reference.date
      : undefined;
    const coverage = reference
      ? pickCoverage(loaded, {
          studentId: String(student._id),
          classId: String(danceClass._id),
          billingType,
          period: reference.date.slice(0, 7),
          sessionIds: referenceSessions
            .filter((item) => String(item.classId) === String(danceClass._id) && item.sessionDate === reference.date)
            .map((item) => String(item._id)),
          days: [reference.date],
          listPrice: expectedAmount(danceClass, billingType)
        })
      : undefined;

    const row: StudentEnrollmentRow = {
      enrollmentId: String(enrollment._id),
      classId: String(danceClass._id),
      className: danceClass.name,
      disciplines: (danceClass.disciplineIds ?? []).map((item: any) => item.name),
      segments: (danceClass.segmentIds ?? []).map((item: any) => item.name),
      levels: (danceClass.levelIds ?? []).map((item: any) => item.name),
      billingType,
      paymentStatus:
        billingType !== "FREE" && !reference
          ? "PENDING"
          : professorPaymentStatus(billingType, coverage?.status),
      amount: coverage?.amount ?? expectedAmount(danceClass, billingType),
      reference:
        billingType === "FREE" || !when
          ? null
          : billingType === "MONTHLY"
            ? { kind: "MONTH", value: when }
            : { kind: "CLASS", value: when },
      enrolledAt: enrollment.enrolledAt
    };

    const key = String(student._id);
    const existing = rows.get(key);
    if (existing) {
      existing.enrollments.push(row);
    } else {
      rows.set(key, {
        id: key,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        enrollments: [row],
        financialStatus: "FREE",
        lastAttendance: lastAttendance.get(key) ?? null
      });
    }
  }

  const result = [...rows.values()];
  for (const row of result) {
    row.financialStatus = row.enrollments.reduce<ProfessorPaymentStatus>(
      (worst, item) => (severity[item.paymentStatus] > severity[worst] ? item.paymentStatus : worst),
      "FREE"
    );
  }

  return result.sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName, "es") || a.firstName.localeCompare(b.firstName, "es")
  );
}
