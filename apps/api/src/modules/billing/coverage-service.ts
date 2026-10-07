import { Types, type ClientSession } from "mongoose";
import { academyNow, utcDayRange } from "../../common/dates";
import { toPesos } from "../../common/money";
import { ClassSessionModel } from "../sessions/class-session.model";
import { SessionBookingModel } from "../sessions/session-booking.model";
import { chargeState } from "./balance-service";
import { ChargeModel } from "./charge.model";
import { PaymentAllocationModel } from "./payment-allocation.model";
import { CollectionModel } from "./collection.model";
import { legacyPaymentToChargeView, unmirroredLegacyPayments, type ChargeView } from "./legacy-adapter";

type BillingType = "PER_CLASS" | "MONTHLY" | "FREE";

export interface CoverageResult {
  /** PAID, PARTIAL (some money applied), PENDING, OVERDUE, NONE (nothing generated yet) or FREE. */
  status: "PAID" | "PARTIAL" | "PENDING" | "OVERDUE" | "NONE" | "FREE";
  paymentType: "PER_CLASS" | "MONTHLY" | null;
  /** Legacy field kept for older screens: id of the legacy Payment when there is one. */
  paymentId?: string;
  chargeId?: string;
  /** Pesos, for compatibility with screens that show amounts in pesos. */
  amount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentMethod?: string;
  receiptNumber?: string;
}

const RANK: Record<string, number> = { PAID: 0, PARTIAL: 1, OVERDUE: 2, PENDING: 3 };

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
 * What covers each participant of a session, financially. A monthly fee of the session's month
 * covers every ordinary session of that group (no attendance limit); a class fee covers its
 * session and the sessions it was rescheduled to. Whatever the current billing mode is, the
 * charges that really exist decide (billing mode is only the rule for new charges).
 */
export async function sessionCoverage(
  organizationId: string,
  session: { _id: Types.ObjectId; classId: Types.ObjectId; sessionDate: string },
  danceClass: { pricePerClass?: number; monthlyPrice?: number },
  participants: Array<{ studentId: string; billingType: BillingType }>
): Promise<Map<string, CoverageResult>> {
  const result = new Map<string, CoverageResult>();
  const billable = participants.filter((item) => item.billingType !== "FREE");
  for (const item of participants) {
    if (item.billingType === "FREE") {
      result.set(item.studentId, { status: "FREE", paymentType: null, amount: 0, paidAmount: 0, balanceAmount: 0 });
    }
  }
  if (!billable.length) return result;

  const { lineage: chain, rootDate } = await sessionLineage(session._id);
  // A student moved here from another time of the same day keeps what paid that other time.
  const transfers = await SessionBookingModel.find({
    organizationId,
    sessionId: session._id,
    status: "BOOKED",
    sourceSessionId: { $exists: true }
  })
    .select("sourceSessionId")
    .lean<any[]>();
  const lineage = [...chain, ...transfers.map((item) => item.sourceSessionId as Types.ObjectId)];
  const period = session.sessionDate.slice(0, 7);
  const studentIds = billable.map((item) => new Types.ObjectId(item.studentId));
  const days = [...new Set([session.sessionDate, rootDate].filter(Boolean) as string[])];

  const chargeFilter = {
    organizationId,
    classId: session.classId,
    studentId: { $in: studentIds },
    status: { $ne: "VOID" },
    $or: [
      { kind: "MONTHLY_FEE", period },
      { kind: "CLASS_FEE", sessionId: { $in: lineage } },
      { kind: "CLASS_FEE", sessionId: { $exists: false }, serviceDate: { $in: days } }
    ]
  };
  const legacyFilter = {
    organizationId,
    classId: session.classId,
    studentId: { $in: studentIds },
    status: { $ne: "CANCELLED" },
    $or: [
      { paymentType: "MONTHLY", period },
      { paymentType: "PER_CLASS", sessionId: { $in: lineage } },
      ...days.map((day) => {
        const { start, end } = utcDayRange(day);
        return { paymentType: "PER_CLASS", sessionId: { $exists: false }, classDate: { $gte: start, $lt: end } };
      })
    ]
  };

  const [charges, legacy] = await Promise.all([
    ChargeModel.find(chargeFilter).lean<ChargeView[]>(),
    unmirroredLegacyPayments(legacyFilter)
  ]);
  const views: ChargeView[] = [...charges, ...legacy.map(legacyPaymentToChargeView)];

  // Receipt and method of the last collection applied to each charge (for the session screen).
  const allocations = charges.length
    ? await PaymentAllocationModel.find({ organizationId, chargeId: { $in: charges.map((item) => item._id) } })
        .sort({ createdAt: -1 })
        .lean<any[]>()
    : [];
  const collections = allocations.length
    ? await CollectionModel.find({ _id: { $in: allocations.map((item) => item.collectionId) } })
        .select("method receiptNumber legacyPaymentId")
        .lean<any[]>()
    : [];
  const collectionById = new Map(collections.map((item) => [String(item._id), item]));
  const lastCollectionByCharge = new Map<string, any>();
  for (const allocation of allocations) {
    if (!lastCollectionByCharge.has(String(allocation.chargeId))) {
      lastCollectionByCharge.set(String(allocation.chargeId), collectionById.get(String(allocation.collectionId)));
    }
  }
  const legacyById = new Map(legacy.map((item) => [String(item._id), item]));

  const today = academyNow().date;
  for (const participant of billable) {
    const candidates = views
      .filter((view) => String(view.studentId) === participant.studentId)
      .map((view) => ({ view, state: chargeState(view, today) }))
      .filter((item) => item.state.status !== "VOID")
      .sort(
        (a, b) =>
          RANK[a.state.status]! - RANK[b.state.status]! ||
          Number((b.view.kind === "MONTHLY_FEE") === (participant.billingType === "MONTHLY")) -
            Number((a.view.kind === "MONTHLY_FEE") === (participant.billingType === "MONTHLY")) ||
          (b.view.createdAt?.getTime() ?? 0) - (a.view.createdAt?.getTime() ?? 0)
      );
    const best = candidates[0];
    if (!best) {
      const listPrice = participant.billingType === "MONTHLY" ? danceClass.monthlyPrice ?? 0 : danceClass.pricePerClass ?? 0;
      result.set(participant.studentId, { status: "NONE", paymentType: null, amount: listPrice, paidAmount: 0, balanceAmount: listPrice });
      continue;
    }
    const legacyPayment = best.view.legacy ? legacyById.get(String(best.view._id)) : undefined;
    const collection = lastCollectionByCharge.get(String(best.view._id));
    result.set(participant.studentId, {
      status: best.state.status as CoverageResult["status"],
      paymentType: best.view.kind === "MONTHLY_FEE" ? "MONTHLY" : "PER_CLASS",
      paymentId: legacyPayment ? String(legacyPayment._id) : best.view.legacyPaymentId ? String(best.view.legacyPaymentId) : undefined,
      chargeId: best.view.legacy ? undefined : String(best.view._id),
      amount: toPesos(best.state.owedCents),
      paidAmount: toPesos(best.state.paidCents),
      balanceAmount: toPesos(best.state.balanceCents),
      paymentMethod: legacyPayment?.paymentMethod ?? collection?.method,
      receiptNumber: legacyPayment?.receiptNumber ?? collection?.receiptNumber
    });
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
