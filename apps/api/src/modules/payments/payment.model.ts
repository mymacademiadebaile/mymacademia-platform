import {
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  type PaymentStatus,
  type PaymentType
} from "@mym/shared";
import { Schema, Types, model } from "mongoose";
import {
  ACTIVE_CHARGE_INDEX_NAME,
  RECEIPT_INDEX_NAME,
  activeChargeKeyOf
} from "./active-charge-key";

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId?: Types.ObjectId;
  /** Concrete occurrence for a per-class payment. Optional for legacy/manual charges. */
  sessionId?: Types.ObjectId;
  paymentType: PaymentType;
  classDate?: Date;
  concept: string;
  period: string;
  amount: number;
  dueDate: Date;
  status: PaymentStatus;
  paidAt?: Date;
  paymentMethod?: PaymentMethod;
  receiptNumber?: string;
  proofUrl?: string;
  notes?: string;
  paidByUserId?: Types.ObjectId;
  cancelledAt?: Date;
  cancelledByUserId?: Types.ObjectId;
  cancellationReason?: string;
  /** Internal integrity key, present only while the payment is not CANCELLED. Never exposed by the API. */
  activeChargeKey?: string;
}

const paymentSchema = new Schema<Payment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "DanceClass", index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession", index: true },
    paymentType: { type: String, enum: PAYMENT_TYPES, default: "MONTHLY", index: true },
    classDate: { type: Date, index: true },
    concept: { type: String, required: true, trim: true },
    period: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "PENDING", index: true },
    paidAt: { type: Date },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    receiptNumber: { type: String, trim: true },
    proofUrl: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    paidByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    cancelledAt: { type: Date },
    cancelledByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    // select: false keeps it out of every query result (lean or not); the backfill uses the raw driver.
    activeChargeKey: { type: String, select: false }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, returned: Record<string, unknown>) => {
        delete returned.activeChargeKey;
        return returned;
      }
    }
  }
);

// Creating or changing the identity of a payment derives the key from the payment itself, so no
// endpoint can forget it. Updates that bypass documents (findOneAndUpdate) must $unset it explicitly,
// as cancel does, because the key is not loaded (select: false).
paymentSchema.pre("validate", function () {
  const identityChanged = [
    "status",
    "paymentType",
    "classId",
    "sessionId",
    "studentId",
    "classDate",
    "period"
  ].some((path) => this.isModified(path));

  if (this.isNew || identityChanged) this.activeChargeKey = activeChargeKeyOf(this);
});

paymentSchema.index({ organizationId: 1, studentId: 1, classId: 1, paymentType: 1, period: 1 });
paymentSchema.index({ organizationId: 1, studentId: 1, classId: 1, paymentType: 1, classDate: 1 });
paymentSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
// Last line of defence against duplicate active charges. Partial (not sparse) so payments without
// a key, including any number of CANCELLED ones, never collide.
paymentSchema.index(
  { organizationId: 1, activeChargeKey: 1 },
  {
    unique: true,
    name: ACTIVE_CHARGE_INDEX_NAME,
    partialFilterExpression: { activeChargeKey: { $type: "string" } }
  }
);
paymentSchema.index(
  { organizationId: 1, receiptNumber: 1 },
  {
    unique: true,
    name: RECEIPT_INDEX_NAME,
    partialFilterExpression: { receiptNumber: { $type: "string" } }
  }
);

export const PaymentModel = model<Payment>("Payment", paymentSchema);
