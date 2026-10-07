import { CHARGE_KINDS, MID_MONTH_POLICIES, type ChargeKind, type MidMonthPolicy } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

export const CHARGE_STATUSES = ["OPEN", "PAID", "VOID"] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const CHARGE_ORIGINS = ["GENERATED", "SESSION", "MANUAL", "MIGRATED"] as const;
export type ChargeOrigin = (typeof CHARGE_ORIGINS)[number];

/**
 * An economic obligation of a student (monthly fee, class fee or other concept).
 * Money received lives in Collection; PaymentAllocation links both. A charge is never deleted:
 * mistakes are voided with a reason, which releases its identity (`chargeKey`).
 */
export interface Charge {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId?: Types.ObjectId;
  enrollmentId?: Types.ObjectId;
  kind: ChargeKind;
  /** YYYY-MM the charge belongs to (service period). */
  period: string;
  /** Session a class fee pays for (the original one when it was rescheduled). */
  sessionId?: Types.ObjectId;
  /** Calendar day of the service (class day) when it applies. */
  serviceDate?: string;
  concept: string;
  /** Price before discounts or surcharges. */
  listCents: number;
  /** Amount owed before adjustments (list price, prorated or custom amount). */
  amountCents: number;
  /** Net adjustments: discounts are negative, surcharges positive. */
  adjustmentsCents: number;
  /** Money applied to this charge (allocations minus reversals). */
  paidCents: number;
  /** amountCents + adjustmentsCents - paidCents, kept in sync inside transactions. */
  balanceCents: number;
  /** Calendar day (YYYY-MM-DD) the charge is due. Overdue from the next day on. */
  dueDate: string;
  status: ChargeStatus;
  origin: ChargeOrigin;
  /** Unique identity while the charge is not void. */
  chargeKey?: string;
  joinPolicy?: MidMonthPolicy;
  legacyPaymentId?: Types.ObjectId;
  notes?: string;
  createdByUserId?: Types.ObjectId;
  voidedAt?: Date;
  voidedByUserId?: Types.ObjectId;
  voidReason?: string;
  /** Bumped inside every transaction that changes the charge's money. */
  lockVersion: number;
}

const chargeSchema = new Schema<Charge>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", index: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", index: true },
    kind: { type: String, enum: CHARGE_KINDS, required: true },
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession", index: true },
    serviceDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    concept: { type: String, required: true, trim: true, maxlength: 160 },
    listCents: { type: Number, required: true, min: 0 },
    amountCents: { type: Number, required: true, min: 0 },
    adjustmentsCents: { type: Number, default: 0 },
    paidCents: { type: Number, default: 0, min: 0 },
    balanceCents: { type: Number, required: true },
    dueDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, enum: CHARGE_STATUSES, default: "OPEN", index: true },
    origin: { type: String, enum: CHARGE_ORIGINS, default: "MANUAL" },
    chargeKey: { type: String },
    joinPolicy: { type: String, enum: MID_MONTH_POLICIES },
    legacyPaymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: { type: Date },
    voidedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    voidReason: { type: String, trim: true, maxlength: 500 },
    lockVersion: { type: Number, default: 0 }
  },
  { timestamps: true }
);

chargeSchema.index(
  { organizationId: 1, chargeKey: 1 },
  { unique: true, partialFilterExpression: { chargeKey: { $type: "string" } } }
);
chargeSchema.index(
  { organizationId: 1, legacyPaymentId: 1 },
  { unique: true, partialFilterExpression: { legacyPaymentId: { $type: "objectId" } } }
);
chargeSchema.index({ organizationId: 1, studentId: 1, status: 1, dueDate: 1 });
chargeSchema.index({ organizationId: 1, classId: 1, period: 1 });
chargeSchema.index({ organizationId: 1, status: 1, dueDate: 1 });

export const ChargeModel = model<Charge>("Charge", chargeSchema);

/** Identity of a monthly fee: one per student, group and month. */
export function monthlyChargeKey(studentId: unknown, classId: unknown, period: string) {
  return `MONTHLY:${String(studentId)}:${String(classId)}:${period}`;
}

/** Identity of a class fee: one per student and (original) session. */
export function classChargeKey(studentId: unknown, sessionId: unknown) {
  return `CLASS:${String(studentId)}:${String(sessionId)}`;
}

/** Identity of a legacy class fee without session: student, group and class day. */
export function classDayChargeKey(studentId: unknown, classId: unknown, date: string) {
  return `CLASSDAY:${String(studentId)}:${String(classId)}:${date}`;
}
