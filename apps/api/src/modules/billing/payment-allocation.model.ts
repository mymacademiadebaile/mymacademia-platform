import { Schema, Types, model } from "mongoose";

/** Applies part of a collection to a charge. Reversals (refunds) are recorded, never deleted. */
export interface PaymentAllocation {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  collectionId: Types.ObjectId;
  chargeId: Types.ObjectId;
  amountCents: number;
  reversedCents: number;
  /** Argentina calendar day the allocation was made (credit may be applied after the payment day). */
  accountingDate: string;
  createdByUserId?: Types.ObjectId;
}

const paymentAllocationSchema = new Schema<PaymentAllocation>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    collectionId: { type: Schema.Types.ObjectId, ref: "Collection", required: true, index: true },
    chargeId: { type: Schema.Types.ObjectId, ref: "Charge", required: true, index: true },
    amountCents: { type: Number, required: true, min: 1 },
    reversedCents: { type: Number, default: 0, min: 0 },
    accountingDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const PaymentAllocationModel = model<PaymentAllocation>("PaymentAllocation", paymentAllocationSchema);
