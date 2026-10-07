import { COLLECTION_METHODS, type CollectionMethod } from "@mym/shared";
import { Schema, Types, model } from "mongoose";

/**
 * Money actually received. Immutable once created except for the denormalized counters
 * (`allocatedCents`, `refundedCents`), which change only through allocations and refunds.
 * Its `accountingDate` is the Argentina calendar day the money came in and never changes.
 */
export interface Collection {
  organizationId: Types.ObjectId;
  branchId: Types.ObjectId;
  /** Student who paid (payer). Allocations may cover charges of this student only. */
  studentId: Types.ObjectId;
  receivedAt: Date;
  accountingDate: string;
  method: CollectionMethod;
  amountCents: number;
  allocatedCents: number;
  refundedCents: number;
  receiptNumber?: string;
  notes?: string;
  /** Private Cloudinary asset of the transfer proof. Never a public URL. */
  proof?: { publicId: string; resourceType: string; format?: string; uploadedAt: Date };
  /** Session the money was collected from, when it was collected in class. */
  sessionId?: Types.ObjectId;
  idempotencyKey?: string;
  legacyPaymentId?: Types.ObjectId;
  /** Public proof URL uploaded by the old system, kept only as history. */
  legacyProofUrl?: string;
  createdByUserId?: Types.ObjectId;
  lockVersion: number;
}

const collectionSchema = new Schema<Collection>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    receivedAt: { type: Date, required: true },
    accountingDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    method: { type: String, enum: COLLECTION_METHODS, required: true },
    amountCents: { type: Number, required: true, min: 1 },
    allocatedCents: { type: Number, default: 0, min: 0 },
    refundedCents: { type: Number, default: 0, min: 0 },
    receiptNumber: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    proof: {
      publicId: { type: String },
      resourceType: { type: String },
      format: { type: String },
      uploadedAt: { type: Date }
    },
    sessionId: { type: Schema.Types.ObjectId, ref: "ClassSession" },
    idempotencyKey: { type: String, trim: true, maxlength: 100 },
    legacyPaymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    legacyProofUrl: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    lockVersion: { type: Number, default: 0 }
  },
  { timestamps: true }
);

collectionSchema.index({ organizationId: 1, accountingDate: 1 });
collectionSchema.index({ organizationId: 1, studentId: 1, receivedAt: -1 });
collectionSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
collectionSchema.index(
  { organizationId: 1, legacyPaymentId: 1 },
  { unique: true, partialFilterExpression: { legacyPaymentId: { $type: "objectId" } } }
);
collectionSchema.index(
  { organizationId: 1, receiptNumber: 1 },
  { unique: true, partialFilterExpression: { receiptNumber: { $type: "string" } } }
);

export const CollectionModel = model<Collection>("Collection", collectionSchema);

/** Money of a collection not applied to any charge and not returned (credit in favour). */
export function availableCreditCents(collection: { amountCents: number; allocatedCents: number; refundedCents: number }) {
  return collection.amountCents - collection.allocatedCents - collection.refundedCents;
}
