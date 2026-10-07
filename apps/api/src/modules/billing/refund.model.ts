import { COLLECTION_METHODS, type CollectionMethod } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

/**
 * Money returned to a student. It is its own cash movement, dated the day it happens, so the
 * cash of the original collection day never changes.
 */
export interface Refund {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  collectionId: Types.ObjectId;
  /** Charge whose allocation was reversed; absent when unapplied credit was returned. */
  chargeId?: Types.ObjectId;
  allocationId?: Types.ObjectId;
  amountCents: number;
  refundedAt: Date;
  accountingDate: string;
  method: CollectionMethod;
  reason: string;
  legacyPaymentId?: Types.ObjectId;
  createdByUserId?: Types.ObjectId;
}

const refundSchema = new Schema<Refund>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    chargeId: { type: Schema.Types.ObjectId, ref: "Charge" },
    allocationId: { type: Schema.Types.ObjectId, ref: "PaymentAllocation" },
    amountCents: { type: Number, required: true, min: 1 },
    refundedAt: { type: Date, required: true },
    accountingDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    method: { type: String, enum: COLLECTION_METHODS, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    legacyPaymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

refundSchema.index({ organizationId: 1, accountingDate: 1 });
refundSchema.index(
  { organizationId: 1, legacyPaymentId: 1 },
  { unique: true, partialFilterExpression: { legacyPaymentId: { $type: "objectId" } } }
);

export const RefundModel = model<Refund>("Refund", refundSchema);
