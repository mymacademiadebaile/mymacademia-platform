import type { ClientSession, Types } from "mongoose";
import { academyDateOf, classDateKey } from "../../common/dates";
import { toCents } from "../../common/money";
import { PaymentModel } from "../payments/payment.model";
import { ChargeModel, classChargeKey, classDayChargeKey, monthlyChargeKey, type ChargeStatus } from "./charge.model";

/**
 * The legacy Payment collection mixes debt and payment. This module is the single translation
 * of a Payment into the new model, used by:
 * - legacy-sync (mirrors every write of the old endpoints),
 * - the migration script,
 * - read services, for payments not mirrored yet (before the migration runs).
 */

export interface LegacyPaymentLike {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId?: Types.ObjectId;
  sessionId?: Types.ObjectId;
  paymentType: "PER_CLASS" | "MONTHLY";
  classDate?: Date;
  concept: string;
  period: string;
  amount: number;
  dueDate: Date;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  paidAt?: Date;
  paymentMethod?: "CASH" | "TRANSFER" | "CARD" | "OTHER";
  receiptNumber?: string;
  proofUrl?: string;
  proof?: { publicId: string; resourceType: string; format?: string; uploadedAt: Date };
  notes?: string;
  paidByUserId?: Types.ObjectId;
  cancelledAt?: Date;
  cancellationReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Charge-shaped view of a legacy payment. */
export interface ChargeView {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId?: Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  kind: "MONTHLY_FEE" | "CLASS_FEE" | "OTHER";
  period: string;
  sessionId?: Types.ObjectId;
  serviceDate?: string;
  concept: string;
  listCents: number;
  amountCents: number;
  adjustmentsCents: number;
  paidCents: number;
  balanceCents: number;
  dueDate: string;
  status: ChargeStatus;
  chargeKey?: string;
  legacyPaymentId?: Types.ObjectId;
  createdAt?: Date;
  /** True for a legacy payment that has no mirror yet (read-only view). */
  legacy?: boolean;
}

export function legacyChargeKey(payment: LegacyPaymentLike) {
  if (!payment.classId) return undefined;
  if (payment.paymentType === "MONTHLY") return monthlyChargeKey(payment.studentId, payment.classId, payment.period);
  if (payment.sessionId) return classChargeKey(payment.studentId, payment.sessionId);
  if (payment.classDate) return classDayChargeKey(payment.studentId, payment.classId, classDateKey(payment.classDate));
  return undefined;
}

/** Charge fields of a legacy payment. Money paid is represented by its collection, not here. */
export function legacyPaymentToChargeFields(payment: LegacyPaymentLike) {
  const amountCents = toCents(payment.amount);
  const paid = payment.status === "PAID";
  const voided = payment.status === "CANCELLED";
  return {
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    studentId: payment.studentId,
    classId: payment.classId,
    kind: payment.paymentType === "MONTHLY" ? ("MONTHLY_FEE" as const) : ("CLASS_FEE" as const),
    period: payment.period,
    sessionId: payment.sessionId,
    serviceDate: payment.classDate ? classDateKey(payment.classDate) : undefined,
    concept: payment.concept,
    listCents: amountCents,
    amountCents,
    adjustmentsCents: 0,
    paidCents: paid ? amountCents : 0,
    balanceCents: paid || voided ? 0 : amountCents,
    dueDate: classDateKey(payment.dueDate),
    status: (voided ? "VOID" : paid ? "PAID" : "OPEN") as ChargeStatus,
    origin: "MIGRATED" as const,
    chargeKey: voided ? undefined : legacyChargeKey(payment),
    legacyPaymentId: payment._id,
    notes: payment.notes,
    ...(voided ? { voidedAt: payment.cancelledAt, voidReason: payment.cancellationReason ?? "Cancelado en el sistema anterior" } : {})
  };
}

/** Collection fields of a paid legacy payment. */
export function legacyPaymentToCollectionFields(payment: LegacyPaymentLike) {
  const receivedAt = payment.paidAt ?? payment.updatedAt ?? payment.createdAt ?? new Date();
  return {
    organizationId: payment.organizationId,
    branchId: payment.branchId,
    studentId: payment.studentId,
    receivedAt,
    accountingDate: academyDateOf(receivedAt),
    method: payment.paymentMethod ?? "OTHER",
    amountCents: toCents(payment.amount),
    allocatedCents: toCents(payment.amount),
    refundedCents: 0,
    receiptNumber: payment.receiptNumber,
    sessionId: payment.sessionId,
    legacyPaymentId: payment._id,
    legacyProofUrl: payment.proofUrl,
    ...(payment.proof?.publicId ? { proof: payment.proof } : {}),
    createdByUserId: payment.paidByUserId
  };
}

export function legacyPaymentToChargeView(payment: LegacyPaymentLike): ChargeView {
  return { _id: payment._id, ...legacyPaymentToChargeFields(payment), createdAt: payment.createdAt, legacy: true };
}

/** Legacy payments matching `filter` that have no mirror in the new model yet. */
export async function unmirroredLegacyPayments(filter: Record<string, unknown>, session?: ClientSession) {
  const payments = await PaymentModel.find(filter).session(session ?? null).lean<LegacyPaymentLike[]>();
  if (!payments.length) return [];
  const mirrored = new Set(
    (
      await ChargeModel.find({ legacyPaymentId: { $in: payments.map((item) => item._id) } })
        .select("legacyPaymentId")
        .session(session ?? null)
        .lean<Array<{ legacyPaymentId: Types.ObjectId }>>()
    ).map((item) => String(item.legacyPaymentId))
  );
  return payments.filter((item) => !mirrored.has(String(item._id)));
}
