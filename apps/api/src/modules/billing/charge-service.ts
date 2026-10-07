import type { MidMonthPolicy } from "@mym/shared";
import { Types, type ClientSession } from "mongoose";
import { academyNow, daysInPeriod, periodBounds, periodOf } from "../../common/dates";
import { AppError } from "../../common/http/app-error";
import { prorateCents, toCents } from "../../common/money";
import { withTransaction } from "../../common/transaction";
import { AuditLogModel } from "../audit/audit-log.model";
import { DanceClassModel } from "../classes/class.model";
import { OrganizationModel } from "../core/organization.model";
import { EnrollmentModel } from "../enrollments/enrollment.model";
import { billingModeOn, enrollmentPeriods, isEnrollmentValidOn } from "../enrollments/enrollment-validity";
import { ClassSessionModel } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { loadRoster } from "../sessions/roster-service";
import { HolidayModel } from "../scheduling/holiday.model";
import { loadRules } from "../scheduling/schedule-service";
import { planOccurrences } from "../scheduling/session-generator";
import { BillingPeriodModel } from "./billing-period.model";
import { ChargeModel, classChargeKey, classDayChargeKey, monthlyChargeKey } from "./charge.model";
import { hasMonthlyCoverage, sessionLineage } from "./coverage-service";
import { unmirroredLegacyPayments } from "./legacy-adapter";

export interface Actor {
  organizationId: string;
  userId?: string;
}

export const DEFAULT_MONTHLY_DUE_DAY = 10;

export function isDuplicateKey(error: unknown) {
  return (error as { code?: number })?.code === 11000;
}

/** Monthly due day of the organization (1-28), default 10. */
export async function billingSettings(organizationId: string) {
  const organization = await OrganizationModel.findById(organizationId).select("billing").lean<any>();
  return {
    monthlyDueDay: organization?.billing?.monthlyDueDay ?? DEFAULT_MONTHLY_DUE_DAY,
    midMonthPolicy: (organization?.billing?.midMonthPolicy ?? "ASK") as MidMonthPolicy | "ASK"
  };
}

/** Due date of a monthly fee: the configured day of the month, never before the student joined. */
export function monthlyDueDate(period: string, dueDay: number, joinedOn?: string) {
  const day = Math.min(Math.max(1, dueDay), daysInPeriod(period));
  const regular = `${period}-${String(day).padStart(2, "0")}`;
  return joinedOn && joinedOn > regular && periodOf(joinedOn) === period ? joinedOn : regular;
}

/** List price of a monthly fee or class fee for an enrollment (commercial conditions first). */
export function priceCents(
  danceClass: { monthlyPrice?: number; pricePerClass?: number },
  enrollment: { priceOverride?: { monthlyCents?: number; perClassCents?: number } } | undefined,
  kind: "MONTHLY_FEE" | "CLASS_FEE"
) {
  if (kind === "MONTHLY_FEE") {
    return enrollment?.priceOverride?.monthlyCents ?? toCents(danceClass.monthlyPrice ?? 0);
  }
  return enrollment?.priceOverride?.perClassCents ?? toCents(danceClass.pricePerClass ?? 0);
}

/**
 * Share of the month's regular sessions that are on or after `fromDate` for the enrollment's
 * habitual schedule. Used by the PRORATED mid-month policy.
 */
export async function remainingSessionShare(
  organizationId: string,
  danceClass: any,
  enrollment: { seriesIds?: Types.ObjectId[] },
  period: string,
  fromDate: string
) {
  const { from, to } = periodBounds(period);
  const [rules, holidays] = await Promise.all([
    loadRules(organizationId, { classIds: [danceClass._id], from, to }),
    HolidayModel.find({ organizationId, date: { $gte: from, $lte: to } }).lean()
  ]);
  const series = enrollment.seriesIds?.length ? new Set(enrollment.seriesIds.map(String)) : undefined;
  const occurrences = planOccurrences([danceClass], rules, holidays, from, to).filter(
    (item) => !item.holiday && (!series || series.has(String(item.rule.seriesId)))
  );
  const remaining = occurrences.filter((item) => item.date >= fromDate).length;
  return { remaining, total: occurrences.length };
}

export interface MonthlyChargeOptions {
  policy?: MidMonthPolicy;
  customCents?: number;
  dueDay?: number;
}

/**
 * Builds (does not save) the monthly fee of an enrollment for a period, or explains why there is
 * none: not valid that month, not in monthly mode, free group, or a mid-month join without a
 * decision (the organization asks the administrator every time).
 */
export async function planMonthlyCharge(
  organizationId: string,
  enrollment: any,
  danceClass: any,
  period: string,
  options: MonthlyChargeOptions = {}
): Promise<{ charge?: Record<string, unknown>; skip?: "NOT_VALID" | "NOT_MONTHLY" | "FREE" | "NEEDS_DECISION" | "ZERO_PRICE" }> {
  const { from, to } = periodBounds(period);
  if (danceClass.billingMode === "FREE" || danceClass.billingMode === "PER_CLASS") return { skip: "FREE" };

  const periods = enrollmentPeriods(enrollment).filter(
    (item) => item.startDate <= to && (!item.endDate || item.endDate >= from)
  );
  if (!periods.length) return { skip: "NOT_VALID" };
  const stintStart = periods[0].startDate > from ? periods[0].startDate : from;

  // First day of the month on which the student is a monthly student: the stint start, or the
  // day a switch from per-class to monthly took effect.
  const candidates = [
    stintStart,
    ...(enrollment.billingChanges ?? [])
      .map((change: { effectiveDate: string }) => change.effectiveDate)
      .filter((date: string) => date > stintStart && date <= to)
  ].sort();
  const monthlyFrom =
    danceClass.billingMode === "MONTHLY"
      ? stintStart
      : candidates.find((date) => billingModeOn(enrollment, date) === "MONTHLY");
  if (!monthlyFrom) return { skip: "NOT_MONTHLY" };
  const joinedOn = monthlyFrom > from ? monthlyFrom : undefined;

  const listCents = priceCents(danceClass, enrollment, "MONTHLY_FEE");
  let amountCents = listCents;
  let policy: MidMonthPolicy | undefined;

  // Only a partial first month needs a decision; later months are always full. The decision
  // taken when the student enrolled applies to the join month; a mode switch asks again.
  if (joinedOn) {
    const decidedAtEnrollment = joinedOn === periods[0].startDate ? enrollment.joinPolicy : undefined;
    policy = options.policy ?? decidedAtEnrollment;
    if (!policy) return { skip: "NEEDS_DECISION" };
    if (policy === "PRORATED") {
      const share = await remainingSessionShare(organizationId, danceClass, enrollment, period, joinedOn);
      amountCents = share.total ? prorateCents(listCents, share.remaining, share.total) : listCents;
    } else if (policy === "CUSTOM") {
      const custom = options.customCents ?? enrollment.joinCustomCents;
      if (custom === undefined) return { skip: "NEEDS_DECISION" };
      amountCents = custom;
    }
  }
  if (listCents <= 0) return { skip: "ZERO_PRICE" };

  const dueDay = options.dueDay ?? (await billingSettings(organizationId)).monthlyDueDay;
  return {
    charge: {
      organizationId: new Types.ObjectId(organizationId),
      branchId: danceClass.branchId,
      studentId: enrollment.studentId,
      classId: danceClass._id,
      enrollmentId: enrollment._id,
      kind: "MONTHLY_FEE",
      period,
      concept: `Mensualidad ${period} · ${danceClass.name}`,
      listCents,
      amountCents,
      adjustmentsCents: 0,
      paidCents: 0,
      balanceCents: amountCents,
      dueDate: monthlyDueDate(period, dueDay, joinedOn),
      status: amountCents > 0 ? "OPEN" : "PAID",
      origin: "GENERATED",
      chargeKey: monthlyChargeKey(enrollment.studentId, danceClass._id, period),
      ...(policy ? { joinPolicy: policy } : {})
    }
  };
}

/**
 * Generates the monthly fees of a period for every enrollment in monthly mode. Idempotent:
 * existing fees are skipped through the unique chargeKey, so running it twice (or at the same
 * time from two places) never duplicates anything. Legacy monthly payments of the same month
 * count as existing fees.
 */
export async function generateMonthlyCharges(
  actor: Actor,
  period: string,
  options: { classIds?: Array<string | Types.ObjectId>; studentIds?: Array<string | Types.ObjectId> } = {}
) {
  const { from, to } = periodBounds(period);
  const classFilter: Record<string, unknown> = { organizationId: actor.organizationId, billingMode: { $in: ["MONTHLY", "BOTH"] } };
  if (options.classIds) classFilter._id = { $in: options.classIds.map((id) => new Types.ObjectId(String(id))) };
  const classes = await DanceClassModel.find(classFilter).lean<any[]>();
  const classById = new Map(classes.map((item) => [String(item._id), item]));

  const enrollmentFilter: Record<string, unknown> = {
    organizationId: actor.organizationId,
    classId: { $in: classes.map((item) => item._id) }
  };
  if (options.studentIds) enrollmentFilter.studentId = { $in: options.studentIds.map((id) => new Types.ObjectId(String(id))) };
  const enrollments = await EnrollmentModel.find(enrollmentFilter).lean<any[]>();
  const settings = await billingSettings(actor.organizationId);

  const legacyMonthly = new Set(
    (
      await unmirroredLegacyPayments({
        organizationId: actor.organizationId,
        paymentType: "MONTHLY",
        period,
        status: { $ne: "CANCELLED" }
      })
    ).map((item) => `${item.studentId}:${item.classId}`)
  );

  const pendingDecision: Array<{ enrollmentId: string; studentId: string; classId: string; joinedOn: string }> = [];
  const documents: Array<Record<string, unknown>> = [];
  for (const enrollment of enrollments) {
    const danceClass = classById.get(String(enrollment.classId));
    if (!danceClass) continue;
    if (legacyMonthly.has(`${enrollment.studentId}:${enrollment.classId}`)) continue;
    const planned = await planMonthlyCharge(actor.organizationId, enrollment, danceClass, period, { dueDay: settings.monthlyDueDay });
    if (planned.skip === "NEEDS_DECISION") {
      const joined = enrollmentPeriods(enrollment).find((item) => item.startDate >= from && item.startDate <= to);
      pendingDecision.push({
        enrollmentId: String(enrollment._id),
        studentId: String(enrollment.studentId),
        classId: String(enrollment.classId),
        joinedOn: joined?.startDate ?? from
      });
    }
    if (planned.charge) documents.push(planned.charge);
  }

  let created = 0;
  if (documents.length) {
    try {
      const inserted = await ChargeModel.insertMany(documents, { ordered: false });
      created = inserted.length;
    } catch (error: any) {
      const failures = error?.writeErrors ?? [];
      if (!failures.length || failures.some((item: any) => (item.code ?? item.err?.code) !== 11000)) throw error;
      created = error?.insertedDocs?.length ?? documents.length - failures.length;
    }
  }

  await BillingPeriodModel.updateOne(
    { organizationId: actor.organizationId, period },
    {
      $setOnInsert: { organizationId: actor.organizationId, period, status: "OPEN", dueDate: monthlyDueDate(period, settings.monthlyDueDay) },
      $push: {
        runs: {
          at: new Date(),
          userId: actor.userId ? new Types.ObjectId(actor.userId) : undefined,
          created,
          existing: documents.length - created,
          pendingDecision: pendingDecision.length
        }
      }
    },
    { upsert: true }
  );

  if (actor.userId) {
    await AuditLogModel.create({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "MONTHLY_CHARGES_GENERATED",
      entityType: "BillingPeriod",
      metadata: { period, created, existing: documents.length - created, pendingDecision: pendingDecision.length }
    });
  }

  return { period, created, existing: documents.length - created, pendingDecision };
}

/** Saves one planned monthly fee (for example right after a mid-month enrollment decision). */
export async function createMonthlyChargeForEnrollment(
  actor: Actor,
  enrollmentId: string,
  period: string,
  options: MonthlyChargeOptions
) {
  const enrollment = await EnrollmentModel.findOne({ _id: enrollmentId, organizationId: actor.organizationId }).lean<any>();
  if (!enrollment) throw new AppError(404, "Inscripción no encontrada", "ENROLLMENT_NOT_FOUND");
  const danceClass = await DanceClassModel.findOne({ _id: enrollment.classId, organizationId: actor.organizationId }).lean<any>();
  if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");

  if (options.policy) {
    await EnrollmentModel.updateOne(
      { _id: enrollment._id },
      { $set: { joinPolicy: options.policy, ...(options.customCents !== undefined ? { joinCustomCents: options.customCents } : {}) } }
    );
  }
  if (options.policy === "CUSTOM" && options.customCents === undefined) {
    throw new AppError(422, "Indicá el importe personalizado", "CUSTOM_AMOUNT_REQUIRED");
  }

  const planned = await planMonthlyCharge(actor.organizationId, enrollment, danceClass, period, options);
  if (!planned.charge) {
    const messages: Record<string, string> = {
      NOT_VALID: "La inscripción no está vigente en ese mes",
      NOT_MONTHLY: "La inscripción no está en modalidad mensual en ese mes",
      FREE: "La clase no cobra mensualidad",
      NEEDS_DECISION: "Elegí cómo cobrar el primer mes (completo, proporcional o personalizado)",
      ZERO_PRICE: "La clase no tiene precio mensual configurado"
    };
    throw new AppError(422, messages[planned.skip!] ?? "No corresponde mensualidad", `MONTHLY_CHARGE_${planned.skip}`);
  }

  try {
    const charge = await ChargeModel.create({ ...planned.charge, origin: "MANUAL", createdByUserId: actor.userId });
    await AuditLogModel.create({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "CHARGE_CREATED",
      entityType: "Charge",
      entityId: charge._id,
      metadata: { kind: "MONTHLY_FEE", period, enrollmentId, policy: options.policy, amountCents: charge.amountCents }
    });
    return charge;
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, "La mensualidad de ese mes ya existe", "CHARGE_ALREADY_EXISTS");
    throw error;
  }
}

/**
 * The class fee of a student for a session, created only when it applies:
 * 1. the student must be part of the session (enrollment, authorization, makeup);
 * 2. a monthly fee of that group and month means the class is already covered;
 * 3. an existing class fee (also of the original session when rescheduled) is returned as is;
 * 4. otherwise a new CLASS_FEE is created, due on the class day.
 */
export async function ensureClassCharge(actor: Actor, sessionId: string, studentId: string) {
  const session = await ClassSessionModel.findOne({ _id: sessionId, organizationId: actor.organizationId }).lean<any>();
  if (!session) throw new AppError(404, "Clase del día no encontrada", "CLASS_SESSION_NOT_FOUND");
  if (!["SCHEDULED", "IN_PROGRESS", "COMPLETED"].includes(session.status)) {
    throw new AppError(409, "No se cobran clases suspendidas, canceladas o reprogramadas", "SESSION_NOT_BILLABLE");
  }
  const danceClass = await DanceClassModel.findOne({ _id: session.classId, organizationId: actor.organizationId }).lean<any>();
  if (!danceClass) throw new AppError(404, "Clase no encontrada", "CLASS_NOT_FOUND");
  if (danceClass.billingMode === "FREE") throw new AppError(409, "La clase no tiene costo", "SESSION_NOT_BILLABLE");

  const roster = await loadRoster(actor.organizationId, session);
  const participant = roster.find((item) => item.studentId === String(studentId));
  if (!participant) throw new AppError(422, "El alumno no forma parte de esta clase", "STUDENT_NOT_IN_SESSION");
  if (participant.participantType === "TRIAL") throw new AppError(409, "Las clases de prueba no se cobran", "SESSION_NOT_BILLABLE");

  const period = periodOf(session.sessionDate);
  if (await hasMonthlyCoverage(actor.organizationId, studentId, session.classId, period)) {
    return { covered: true as const, reason: "MONTHLY" as const };
  }

  const enrollment = participant.enrollmentId
    ? await EnrollmentModel.findOne({ _id: participant.enrollmentId, organizationId: actor.organizationId }).lean<any>()
    : null;
  if (danceClass.billingMode === "MONTHLY" || (enrollment && billingModeOn(enrollment, session.sessionDate) === "MONTHLY" && isEnrollmentValidOn(enrollment, session.sessionDate))) {
    if (participant.participantType === "ENROLLMENT") {
      throw new AppError(
        409,
        "El alumno está en modalidad mensual: corresponde la mensualidad, no la clase suelta",
        "MONTHLY_STUDENT"
      );
    }
  }

  const { lineage: chain, rootSessionId, rootDate } = await sessionLineage(session._id);
  const transfers = await SessionBookingModel.find({
    organizationId: actor.organizationId,
    sessionId: session._id,
    studentId,
    status: "BOOKED",
    sourceSessionId: { $exists: true }
  })
    .select("sourceSessionId")
    .lean<any[]>();
  const lineage = [...chain, ...transfers.map((item) => item.sourceSessionId as Types.ObjectId)];
  const existing = await ChargeModel.findOne({
    organizationId: actor.organizationId,
    studentId,
    classId: session.classId,
    kind: "CLASS_FEE",
    status: { $ne: "VOID" },
    $or: [{ sessionId: { $in: lineage } }, { sessionId: { $exists: false }, serviceDate: rootDate ?? session.sessionDate }]
  });
  if (existing) return { covered: false as const, charge: existing, created: false };

  const legacy = await unmirroredLegacyPayments({
    organizationId: actor.organizationId,
    studentId,
    classId: session.classId,
    paymentType: "PER_CLASS",
    status: { $ne: "CANCELLED" },
    sessionId: { $in: lineage }
  });
  if (legacy.length) {
    throw new AppError(409, "La clase ya tiene un pago registrado en el sistema anterior", "CHARGE_ALREADY_EXISTS");
  }

  const listCents = priceCents(danceClass, enrollment ?? undefined, "CLASS_FEE");
  if (listCents <= 0) throw new AppError(422, "La clase no tiene precio por clase configurado", "ZERO_PRICE");

  try {
    const charge = await ChargeModel.create({
      organizationId: actor.organizationId,
      branchId: danceClass.branchId,
      studentId,
      classId: danceClass._id,
      enrollmentId: enrollment?._id,
      kind: "CLASS_FEE",
      period: periodOf(rootDate ?? session.sessionDate),
      sessionId: rootSessionId,
      serviceDate: rootDate ?? session.sessionDate,
      concept: `Clase ${rootDate ?? session.sessionDate} · ${danceClass.name}`,
      listCents,
      amountCents: listCents,
      adjustmentsCents: 0,
      paidCents: 0,
      balanceCents: listCents,
      dueDate: rootDate ?? session.sessionDate,
      status: "OPEN",
      origin: "SESSION",
      chargeKey: classChargeKey(studentId, rootSessionId),
      createdByUserId: actor.userId
    });
    if (actor.userId) {
      await AuditLogModel.create({
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "CHARGE_CREATED",
        entityType: "Charge",
        entityId: charge._id,
        metadata: { kind: "CLASS_FEE", sessionId: rootSessionId, studentId, amountCents: listCents }
      });
    }
    return { covered: false as const, charge, created: true };
  } catch (error) {
    if (isDuplicateKey(error)) {
      const charge = await ChargeModel.findOne({ organizationId: actor.organizationId, chargeKey: classChargeKey(studentId, rootSessionId) });
      if (charge) return { covered: false as const, charge, created: false };
    }
    throw error;
  }
}

/** A charge typed by hand (other concepts, or past obligations of inactive students). */
export async function createManualCharge(
  actor: Actor,
  input: {
    studentId: string;
    classId?: string;
    kind: "MONTHLY_FEE" | "CLASS_FEE" | "OTHER";
    period: string;
    serviceDate?: string;
    concept: string;
    amountCents: number;
    dueDate: string;
    notes?: string;
  },
  branchId: Types.ObjectId
) {
  const chargeKey =
    input.kind === "MONTHLY_FEE" && input.classId
      ? monthlyChargeKey(input.studentId, input.classId, input.period)
      : input.kind === "CLASS_FEE" && input.classId && input.serviceDate
        ? classDayChargeKey(input.studentId, input.classId, input.serviceDate)
        : undefined;

  if (input.kind === "CLASS_FEE" && input.classId && input.serviceDate) {
    if (await hasMonthlyCoverage(actor.organizationId, input.studentId, input.classId, periodOf(input.serviceDate))) {
      throw new AppError(409, "El alumno ya tiene la mensualidad de ese mes, que incluye esta clase", "COVERED_BY_MONTHLY");
    }
  }

  try {
    const charge = await ChargeModel.create({
      organizationId: actor.organizationId,
      branchId,
      studentId: input.studentId,
      classId: input.classId,
      kind: input.kind,
      period: input.period,
      serviceDate: input.serviceDate,
      concept: input.concept,
      listCents: input.amountCents,
      amountCents: input.amountCents,
      adjustmentsCents: 0,
      paidCents: 0,
      balanceCents: input.amountCents,
      dueDate: input.dueDate,
      status: "OPEN",
      origin: "MANUAL",
      chargeKey,
      notes: input.notes,
      createdByUserId: actor.userId
    });
    await AuditLogModel.create({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "CHARGE_CREATED",
      entityType: "Charge",
      entityId: charge._id,
      metadata: { ...input }
    });
    return charge;
  } catch (error) {
    if (isDuplicateKey(error)) throw new AppError(409, "Ya existe un cargo para ese concepto", "CHARGE_ALREADY_EXISTS");
    throw error;
  }
}

/** Voids a charge without money applied. Charges with money must be refunded first. */
export async function voidCharge(actor: Actor, chargeId: string, reason: string) {
  if (!reason?.trim()) throw new AppError(422, "Indicá el motivo", "REASON_REQUIRED");
  return withTransaction(async (dbSession: ClientSession | undefined) => {
    const charge = await ChargeModel.findOne({ _id: chargeId, organizationId: actor.organizationId }).session(dbSession ?? null);
    if (!charge) throw new AppError(404, "Cargo no encontrado", "CHARGE_NOT_FOUND");
    if (charge.status === "VOID") return charge;
    if (charge.paidCents > 0) {
      throw new AppError(409, "El cargo tiene pagos aplicados: primero registrá la devolución", "CHARGE_HAS_PAYMENTS");
    }
    charge.status = "VOID";
    charge.balanceCents = 0;
    charge.voidedAt = new Date();
    charge.voidedByUserId = actor.userId ? new Types.ObjectId(actor.userId) : undefined;
    charge.voidReason = reason.trim();
    charge.chargeKey = undefined;
    charge.lockVersion += 1;
    await charge.save({ session: dbSession });
    await AuditLogModel.create(
      [{ organizationId: actor.organizationId, actorUserId: actor.userId, action: "CHARGE_VOIDED", entityType: "Charge", entityId: charge._id, metadata: { reason } }],
      { session: dbSession }
    );
    return charge;
  });
}

/** Today in Argentina, exported for callers that build billing periods. */
export function currentPeriod() {
  return periodOf(academyNow().date);
}
