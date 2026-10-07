import { Types, type ClientSession } from "mongoose";
import { academyNow, utcDayRange } from "../../common/dates";
import { toPesos } from "../../common/money";
import { ClassSessionModel } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { chargeState } from "./balance-service";
import { ChargeModel } from "./charge.model";
import { CollectionModel } from "./collection.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { legacyPaymentToChargeView, unmirroredLegacyPayments, type ChargeView, type LegacyPaymentLike } from "./legacy-adapter";

type BillingType = "PER_CLASS" | "MONTHLY" | "FREE";

export interface CoverageResult {
  /** PAID, PARTIAL (some money applied), PENDING, OVERDUE, NONE (nothing generated yet) or FREE. */
  status: "PAID" | "PARTIAL" | "PENDING" | "OVERDUE" | "NONE" | "FREE";
  paymentType: "PER_CLASS" | "MONTHLY" | null;
  /** Id of the legacy Payment when the coverage comes from one (older screens use it). */
  paymentId?: string;
  chargeId?: string;
  /** Pesos, for compatibility with screens that show amounts in pesos. */
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentMethod?: string;
  receiptNumber?: string;
  dueDate?: string;
}

const RANK: Record<string, number> = { PAID: 0, PARTIAL: 1, OVERDUE: 2, PENDING: 3 };

export interface CoverageViews {
  views: ChargeView[];
  legacyById: Map<string, LegacyPaymentLike>;
  lastCollectionByCharge: Map<string, { method?: string; receiptNumber?: string }>;
}

/**
 * Loads every charge (and legacy payment without mirror) that may cover the given sessions:
 * monthly fees of their months and class fees of the sessions (or of their days, for legacy
 * class fees without session).
 */
export async function loadCoverageViews(
  organizationId: string,
  scope: {
    classIds: Types.ObjectId[];
    studentIds: Types.ObjectId[];
    periods: string[];
    sessionIds: Types.ObjectId[];
    days: string[];
  },
  session?: ClientSession
): Promise<CoverageViews> {
  if (!scope.classIds.length || !scope.studentIds.length) {
    return { views: [], legacyById: new Map(), lastCollectionByCharge: new Map() };
  }
  const days = [...new Set(scope.days)];
  const chargeFilter = {
    organizationId,
    classId: { $in: scope.classIds },
    studentId: { $in: scope.studentIds },
    status: { $ne: "VOID" },
    $or: [
      { kind: "MONTHLY_FEE", period: { $in: scope.periods } },
      { kind: "CLASS_FEE", sessionId: { $in: scope.sessionIds } },
      { kind: "CLASS_FEE", sessionId: { $exists: false }, serviceDate: { $in: days } }
    ]
  };
  const legacyFilter = {
    organizationId,
    classId: { $in: scope.classIds },
    studentId: { $in: scope.studentIds },
    status: { $ne: "CANCELLED" },
    $or: [
      { paymentType: "MONTHLY", period: { $in: scope.periods } },
      { paymentType: "PER_CLASS", sessionId: { $in: scope.sessionIds } },
      ...days.map((day) => {
        const { start, end } = utcDayRange(day);
        return { paymentType: "PER_CLASS", sessionId: { $exists: false }, classDate: { $gte: start, $lt: end } };
      })
    ]
  };

  const [charges, legacy] = await Promise.all([
    ChargeModel.find(chargeFilter).session(session ?? null).lean<ChargeView[]>(),
    unmirroredLegacyPayments(legacyFilter, session)
  ]);

  const allocations = charges.length
    ? await PaymentAllocationModel.find({ organizationId, chargeId: { $in: charges.map((item) => item._id) } })
        .sort({ createdAt: -1 })
        .lean<any[]>()
    : [];
  const collections = allocations.length
    ? await CollectionModel.find({ _id: { $in: allocations.map((item) => item.collectionId) } })
        .select("method receiptNumber")
        .lean<any[]>()
    : [];
  const collectionById = new Map(collections.map((item) => [String(item._id), item]));
  const lastCollectionByCharge = new Map<string, any>();
  for (const allocation of allocations) {
    if (!lastCollectionByCharge.has(String(allocation.chargeId))) {
      lastCollectionByCharge.set(String(allocation.chargeId), collectionById.get(String(allocation.collectionId)));
    }
  }

  return {
    views: [...charges, ...legacy.map(legacyPaymentToChargeView)],
    legacyById: new Map(legacy.map((item) => [String(item._id), item])),
    lastCollectionByCharge
  };
}

/**
 * Picks what covers one student in one session from the loaded views. PAID beats PARTIAL beats
 * OVERDUE beats PENDING; ties prefer the student's billing type on that day, then the most
 * recent charge. Pure and deterministic.
 */
export function pickCoverage(
  loaded: CoverageViews,
  input: {
    studentId: string;
    classId: string;
    billingType: BillingType;
    period: string;
    sessionIds: string[];
    days: string[];
    listPrice: number;
  },
  today = academyNow().date
): CoverageResult {
  if (input.billingType === "FREE") return { status: "FREE", paymentType: null, amount: 0, paidAmount: 0, balanceAmount: 0 };

  const candidates = loaded.views
    .filter(
      (view) =>
        String(view.studentId) === input.studentId &&
        String(view.classId) === input.classId &&
        ((view.kind === "MONTHLY_FEE" && view.period === input.period) ||
          (view.kind === "CLASS_FEE" &&
            (view.sessionId ? input.sessionIds.includes(String(view.sessionId)) : Boolean(view.serviceDate && input.days.includes(view.serviceDate)))))
    )
    .map((view) => ({ view, state: chargeState(view, today) }))
    .filter((item) => item.state.status !== "VOID")
    .sort(
      (a, b) =>
        RANK[a.state.status]! - RANK[b.state.status]! ||
        Number((b.view.kind === "MONTHLY_FEE") === (input.billingType === "MONTHLY")) -
          Number((a.view.kind === "MONTHLY_FEE") === (input.billingType === "MONTHLY")) ||
        (b.view.createdAt?.getTime() ?? 0) - (a.view.createdAt?.getTime() ?? 0) ||
        String(b.view._id).localeCompare(String(a.view._id))
    );

  const best = candidates[0];
  if (!best) {
    return { status: "NONE", paymentType: null, amount: input.listPrice, paidAmount: 0, balanceAmount: input.listPrice };
  }
  const legacyPayment = best.view.legacy ? loaded.legacyById.get(String(best.view._id)) : undefined;
  const collection = loaded.lastCollectionByCharge.get(String(best.view._id));
  return {
    status: best.state.status as CoverageResult["status"],
    paymentType: best.view.kind === "MONTHLY_FEE" ? "MONTHLY" : "PER_CLASS",
    paymentId: legacyPayment ? String(legacyPayment._id) : best.view.legacyPaymentId ? String(best.view.legacyPaymentId) : undefined,
    chargeId: best.view.legacy ? undefined : String(best.view._id),
    amount: toPesos(best.state.owedCents),
    paidAmount: toPesos(best.state.paidCents),
    balanceAmount: toPesos(best.state.balanceCents),
    paymentMethod: legacyPayment?.paymentMethod ?? collection?.method,
    receiptNumber: legacyPayment?.receiptNumber ?? collection?.receiptNumber,
    dueDate: best.view.dueDate
  };
}

/** Original session of a rescheduled chain (payments follow the class, not the date). */
export async function sessionLineage(sessionId: Types.ObjectId, session?: ClientSession) {
  const lineage: Types.ObjectId[] = [sessionId];
  let current = await ClassSessionModel.findById(sessionId).select("rescheduledFromSessionId sessionDate").session(session ?? null).lean<any>();
  let rootDate: string | undefined = current?.sessionDate;
  for (let depth = 0; current?.rescheduledFromSessionId && depth < 10; depth += 1) {
    lineage.push(current.rescheduledFromSessionId);
    current = await ClassSessionModel.findById(current.rescheduledFromSessionId)
      .select("rescheduledFromSessionId sessionDate")
      .session(session ?? null)
      .lean<any>();
    if (current?.sessionDate) rootDate = current.sessionDate;
  }
  return { lineage, rootSessionId: lineage[lineage.length - 1], rootDate };
}

/**
 * Sessions whose payments also cover `sessionId`: its reschedule chain and, for students moved
 * from another time of the same day, the session they came from.
 */
export async function coveringSessions(organizationId: string, sessionId: Types.ObjectId, session?: ClientSession) {
  const { lineage, rootDate, rootSessionId } = await sessionLineage(sessionId, session);
  const transfers = await SessionBookingModel.find({
    organizationId,
    sessionId,
    status: "BOOKED",
    sourceSessionId: { $exists: true }
  })
    .select("sourceSessionId studentId")
    .session(session ?? null)
    .lean<any[]>();
  return {
    lineage: [...lineage, ...transfers.map((item) => item.sourceSessionId as Types.ObjectId)],
    rootDate,
    rootSessionId
  };
}

/**
 * What covers each participant of a session, financially. A monthly fee of the session's month
 * covers every ordinary session of that group (no attendance limit); a class fee covers its
 * session and the sessions it was rescheduled or moved to. Whatever the current billing mode is,
 * the charges that really exist decide (billing mode is only the rule for new charges).
 */
export async function sessionCoverage(
  organizationId: string,
  session: { _id: Types.ObjectId; classId: Types.ObjectId; sessionDate: string },
  danceClass: { pricePerClass?: number; monthlyPrice?: number },
  participants: Array<{ studentId: string; billingType: BillingType }>
): Promise<Map<string, CoverageResult>> {
  const result = new Map<string, CoverageResult>();
  const { lineage, rootDate } = await coveringSessions(organizationId, session._id);
  const period = session.sessionDate.slice(0, 7);
  const days = [...new Set([session.sessionDate, rootDate].filter(Boolean) as string[])];
  const billable = participants.filter((item) => item.billingType !== "FREE");
  const loaded = await loadCoverageViews(organizationId, {
    classIds: [session.classId],
    studentIds: billable.map((item) => new Types.ObjectId(item.studentId)),
    periods: [period],
    sessionIds: lineage,
    days
  });

  for (const participant of participants) {
    result.set(
      participant.studentId,
      pickCoverage(loaded, {
        studentId: participant.studentId,
        classId: String(session.classId),
        billingType: participant.billingType,
        period,
        sessionIds: lineage.map(String),
        days,
        listPrice: participant.billingType === "MONTHLY" ? danceClass.monthlyPrice ?? 0 : danceClass.pricePerClass ?? 0
      })
    );
  }
  return result;
}

/**
 * True when the student already has a monthly fee (any state but void) for the group and month:
 * the session is included and must not generate a class fee.
 */
export async function hasMonthlyCoverage(
  organizationId: string,
  studentId: Types.ObjectId | string,
  classId: Types.ObjectId | string,
  period: string,
  session?: ClientSession
) {
  const charge = await ChargeModel.exists({
    organizationId,
    studentId,
    classId,
    kind: "MONTHLY_FEE",
    period,
    status: { $ne: "VOID" }
  }).session(session ?? null);
  if (charge) return true;
  const legacy = await unmirroredLegacyPayments(
    { organizationId, studentId, classId, paymentType: "MONTHLY", period, status: { $ne: "CANCELLED" } },
    session
  );
  return legacy.length > 0;
}
