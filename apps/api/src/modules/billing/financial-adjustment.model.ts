import { ADJUSTMENT_TYPES, type AdjustmentType } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

/**
 * A change to what a student owes on a charge, with its reason and author:
 * - DISCOUNT / WRITE_OFF: negative amount;
 * - SURCHARGE: positive amount;
 * - CREDIT_TRANSFER: negative amount that recognizes previous payments (for example class fees
 *   already paid when switching to the monthly fee). Source charges are listed for traceability.
 */
export interface FinancialAdjustment {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  chargeId: Types.ObjectId;
  type: AdjustmentType;
  amountCents: number;
  reason: string;
  accountingDate: string;
  sourceChargeIds: Types.ObjectId[];
  createdByUserId?: Types.ObjectId;
}

const financialAdjustmentSchema = new Schema<FinancialAdjustment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    chargeId: { type: Schema.Types.ObjectId, ref: "Charge", required: true, index: true },
    type: { type: String, enum: ADJUSTMENT_TYPES, required: true },
    amountCents: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    accountingDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    sourceChargeIds: { type: [Schema.Types.ObjectId], default: [] },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const FinancialAdjustmentModel = model<FinancialAdjustment>("FinancialAdjustment", financialAdjustmentSchema);
