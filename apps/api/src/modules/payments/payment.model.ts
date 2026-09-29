import { PAYMENT_STATUSES, type PaymentStatus } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

export const PAYMENT_METHODS = ["CASH", "TRANSFER", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Payment {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
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
}

const paymentSchema = new Schema<Payment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
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
    cancellationReason: { type: String, trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

paymentSchema.index({ organizationId: 1, studentId: 1, period: 1, concept: 1 });
paymentSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
paymentSchema.index(
  { organizationId: 1, receiptNumber: 1 },
  { unique: true, sparse: true }
);

export const PaymentModel = model<Payment>("Payment", paymentSchema);
