import { Types } from "mongoose";
import { academyNow, addDays, classDateKey } from "../../common/dates";
import { toCents } from "../../common/money";
import { DanceClassModel } from "../classes/class.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { enrollmentPeriods } from "../enrollments/enrollment-validity";
import { PaymentModel } from "../payments/payment.model";
import { ClassScheduleModel } from "../scheduling/class-schedule.model";
import { ensureScheduleRules } from "../scheduling/schedule-service";
import { generateSessions, MAX_GENERATION_DAYS } from "../scheduling/session-generator";
import { ClassAttendanceModel } from "../sessions/class-attendance.model";
import { ClassSessionModel } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { syncLegacyPayment, type SyncOutcome } from "./legacy-sync";
import { MigrationIssueModel } from "./migration-issue.model";

/** Unique index of ClassSession before the redesign; replaced by the partial slotKey index. */
export const LEGACY_SESSION_INDEX = "organizationId_1_classId_1_sessionDate_1_startTime_1";

export interface MigrationReport {
  mode: "DRY_RUN" | "APPLY";
  organizations: number;
  schedules: { classesWithoutRules: number; rulesCreated: number };
  enrollments: { withoutPeriods: number; periodsWritten: number; inferredEarlierStart: number };
  sessions: { adopted: number; created: number; ghostFuture: number; ghostCancelled: number };
  payments: Record<SyncOutcome, number> & { scanned: number };
  indexes: { legacySessionIndexPresent: boolean; legacySessionIndexDropped: boolean };
  validation: {
    legacyPaidCents: number;
    mirroredCollectionCents: number;
    legacyOpenCents: number;
    mirroredOpenCents: number;
    unmirroredPayments: number;
    openIssues: number;
  };
}

/**
 * Progressive, repeatable migration to the scheduling and billing model.
 *
 * - Dry run (default) only reads and reports what would change.
 * - Apply writes, and can be run again: every step skips what is already migrated.
 * - Nothing is deleted except future, untouched sessions of schedules that no longer exist
 *   (they are cancelled with a reason, not removed) and the legacy session unique index.
 * - Ambiguous financial history is written to MigrationIssue, never guessed.
 */
export async function runSchedulingBillingMigration(options: { apply: boolean; now?: Date }): Promise<MigrationReport> {
  const apply = options.apply;
  const today = academyNow(options.now).date;
  const report: MigrationReport = {
    mode: apply ? "APPLY" : "DRY_RUN",
    organizations: 0,
    schedules: { classesWithoutRules: 0, rulesCreated: 0 },
    enrollments: { withoutPeriods: 0, periodsWritten: 0, inferredEarlierStart: 0 },
    sessions: { adopted: 0, created: 0, ghostFuture: 0, ghostCancelled: 0 },
    payments: { scanned: 0, CREATED: 0, CREATED_WITH_COLLECTION: 0, MARKED_PAID: 0, VOIDED: 0, REFUNDED_AND_VOIDED: 0, UNCHANGED: 0, ISSUE: 0 },
    indexes: { legacySessionIndexPresent: false, legacySessionIndexDropped: false },
    validation: { legacyPaidCents: 0, mirroredCollectionCents: 0, legacyOpenCents: 0, mirroredOpenCents: 0, unmirroredPayments: 0, openIssues: 0 }
  };

  // 0. Indexes of the new collections (idempotent) and the legacy session index.
  const sessionIndexes = await ClassSessionModel.collection.indexes().catch(() => []);
  report.indexes.legacySessionIndexPresent = sessionIndexes.some((index) => index.name === LEGACY_SESSION_INDEX);
  if (apply) {
    if (report.indexes.legacySessionIndexPresent) {
      await ClassSessionModel.collection.dropIndex(LEGACY_SESSION_INDEX);
      report.indexes.legacySessionIndexDropped = true;
    }
    await Promise.all(
      [ClassSessionModel, ClassScheduleModel, ChargeModel, CollectionModel, MigrationIssueModel].map((model) => model.createIndexes())
    );
  }

  const organizations = await OrganizationModel.find().select("_id").lean();
  report.organizations = organizations.length;

  for (const organization of organizations) {
    const organizationId = String(organization._id);

    // 1. Recurring rules from the weekly slots of each group.
    const classes = await DanceClassModel.find({ organizationId }).lean<any[]>();
    const withRules = new Set((await ClassScheduleModel.distinct("classId", { organizationId })).map(String));
    const missing = classes.filter((item) => !withRules.has(String(item._id)) && item.schedules?.length);
    report.schedules.classesWithoutRules += missing.length;
    if (apply && missing.length) {
      const before = await ClassScheduleModel.countDocuments({ organizationId });
      await ensureScheduleRules(organizationId, missing);
      report.schedules.rulesCreated += (await ClassScheduleModel.countDocuments({ organizationId })) - before;
    }

    // 2. Explicit enrollment periods. The start is the earliest evidence of the student in the
    //    group (enrollment date, attendance, payments), because reactivations used to overwrite it.
    const enrollments = await EnrollmentModel.find({ organizationId, "periods.0": { $exists: false } }).lean<any[]>();
    report.enrollments.withoutPeriods += enrollments.length;
    for (const enrollment of enrollments) {
      const [period] = enrollmentPeriods(enrollment);
      const evidence = await earliestEvidence(organizationId, enrollment.classId, enrollment.studentId);
      const startDate = evidence && evidence < period.startDate ? evidence : period.startDate;
      if (startDate !== period.startDate) report.enrollments.inferredEarlierStart += 1;
      const endDate = period.endDate && period.endDate < startDate ? startDate : period.endDate;
      if (apply) {
        const set: Record<string, unknown> = { periods: [{ startDate, ...(endDate ? { endDate } : {}) }] };
        if (enrollment.billingPreference && !enrollment.billingChanges?.length) {
          set.billingChanges = [{ effectiveDate: startDate, mode: enrollment.billingPreference, changedAt: new Date() }];
        }
        const result = await EnrollmentModel.updateOne({ _id: enrollment._id, "periods.0": { $exists: false } }, { $set: set });
        report.enrollments.periodsWritten += result.modifiedCount;
      }
    }

    // 3. Sessions: adopt legacy sessions as occurrences of the rules and fill the rolling window.
    const firstSession = await ClassSessionModel.findOne({ organizationId }).sort({ sessionDate: 1 }).select("sessionDate").lean<any>();
    if (apply && firstSession) {
      const end = addDays(today, 60);
      for (let from = firstSession.sessionDate; from <= end; from = addDays(from, MAX_GENERATION_DAYS)) {
        const to = addDays(from, MAX_GENERATION_DAYS - 1) < end ? addDays(from, MAX_GENERATION_DAYS - 1) : end;
        const result = await generateSessions(organizationId, { from, to });
        report.sessions.adopted += result.adopted;
        report.sessions.created += result.created;
      }
    }

    // Future sessions that match no rule (schedule changed before the redesign): cancelled only
    // when untouched; otherwise left for review.
    const ghosts = await ClassSessionModel.find({
      organizationId,
      occurrenceKey: { $exists: false },
      origin: { $nin: ["EXTRA", "RESCHEDULED"] },
      sessionDate: { $gte: today },
      status: "SCHEDULED"
    }).lean<any[]>();
    report.sessions.ghostFuture += ghosts.length;
    for (const ghost of ghosts) {
      const [attendance, bookings, payments] = await Promise.all([
        ClassAttendanceModel.exists({ organizationId, sessionId: ghost._id }),
        SessionBookingModel.exists({ organizationId, sessionId: ghost._id }),
        PaymentModel.exists({ organizationId, sessionId: ghost._id })
      ]);
      if (attendance || bookings || payments) {
        if (apply) {
          await MigrationIssueModel.updateOne(
            { organizationId, kind: "SESSION_WITHOUT_SCHEDULE", entityId: ghost._id },
            {
              $setOnInsert: {
                organizationId,
                kind: "SESSION_WITHOUT_SCHEDULE",
                entityType: "ClassSession",
                entityId: ghost._id,
                message: "Sesión futura que ya no coincide con ningún horario y tiene movimientos: revisar",
                data: { classId: ghost.classId, sessionDate: ghost.sessionDate, startTime: ghost.startTime },
                status: "OPEN"
              }
            },
            { upsert: true }
          );
        }
        continue;
      }
      if (apply) {
        await ClassSessionModel.updateOne(
          { _id: ghost._id, status: "SCHEDULED" },
          {
            $set: { status: "CANCELLED", statusReason: "Horario ya no vigente (migración)" },
            $push: { statusHistory: { from: "SCHEDULED", to: "CANCELLED", reason: "Horario ya no vigente (migración)", at: new Date() } }
          }
        );
        report.sessions.ghostCancelled += 1;
      }
    }

    // 4. Legacy payments into charges, collections and allocations.
    const payments = await PaymentModel.find({ organizationId }).select("_id").lean();
    for (const payment of payments) {
      report.payments.scanned += 1;
      const outcome = await syncLegacyPayment(payment._id, { mode: "migration", dryRun: !apply });
      report.payments[outcome] += 1;
    }

    // 5. Validation: money in the old model must equal money in the new one.
    const legacy = await PaymentModel.find({ organizationId }).lean<any[]>();
    const mirroredCharges = await ChargeModel.find({ organizationId, legacyPaymentId: { $exists: true } }).lean<any[]>();
    const mirroredCollections = await CollectionModel.find({ organizationId, legacyPaymentId: { $exists: true } }).lean<any[]>();
    const mirrored = new Set(mirroredCharges.map((item) => String(item.legacyPaymentId)));
    report.validation.unmirroredPayments += legacy.filter((item) => !mirrored.has(String(item._id))).length;
    report.validation.legacyPaidCents += legacy.filter((item) => item.status === "PAID").reduce((sum, item) => sum + toCents(item.amount), 0);
    report.validation.mirroredCollectionCents += mirroredCollections.reduce((sum, item) => sum + item.amountCents - item.refundedCents, 0);
    report.validation.legacyOpenCents += legacy
      .filter((item) => item.status === "PENDING" || item.status === "OVERDUE")
      .reduce((sum, item) => sum + toCents(item.amount), 0);
    report.validation.mirroredOpenCents += mirroredCharges.filter((item) => item.status === "OPEN").reduce((sum, item) => sum + item.balanceCents, 0);
    report.validation.openIssues += await MigrationIssueModel.countDocuments({ organizationId, status: "OPEN" });
  }

  return report;
}

/** Earliest calendar day with attendance or a payment of the student in the group. */
async function earliestEvidence(organizationId: string, classId: Types.ObjectId, studentId: Types.ObjectId) {
  const [attendance, payment] = await Promise.all([
    ClassAttendanceModel.find({ organizationId, studentId }).select("sessionId").lean<any[]>(),
    PaymentModel.findOne({ organizationId, classId, studentId, status: { $ne: "CANCELLED" } }).sort({ classDate: 1, period: 1 }).lean<any>()
  ]);
  const sessions = attendance.length
    ? await ClassSessionModel.find({ _id: { $in: attendance.map((item) => item.sessionId) }, classId }).sort({ sessionDate: 1 }).limit(1).lean<any[]>()
    : [];
  const candidates = [
    sessions[0]?.sessionDate,
    payment?.classDate ? classDateKey(payment.classDate) : payment?.period ? `${payment.period}-01` : undefined
  ].filter(Boolean) as string[];
  return candidates.sort()[0];
}

/** Guard: apply only against a local database unless explicitly allowed. */
export function assertSafeTarget(uri: string, allowRemote: boolean) {
  const local = /mongodb(\+srv)?:\/\/(127\.0\.0\.1|localhost)/.test(uri);
  if (!local && !allowRemote) {
    throw new Error(
      "Refusing to apply the migration to a non-local database. Run the dry-run there, review the report, " +
        "back up the database and pass --allow-remote explicitly."
    );
  }
}

