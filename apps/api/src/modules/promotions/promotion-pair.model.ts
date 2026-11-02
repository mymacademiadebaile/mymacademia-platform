import { Schema, Types, model } from "mongoose";

export interface PromotionPair {
  organizationId: Types.ObjectId;
  promotionId: Types.ObjectId;
  classId: Types.ObjectId;
  payerStudentId: Types.ObjectId;
  beneficiaryStudentId: Types.ObjectId;
  payerEnrollmentId: Types.ObjectId;
  beneficiaryEnrollmentId: Types.ObjectId;
  /** Multikey unique index prevents a person joining two pairs in one campaign. */
  participantIds: Types.ObjectId[];
  assignedAt: Date;
  benefitFrom: string;
  benefitTo: string;
  createdByUserId: Types.ObjectId;
  voidedAt?: Date;
  voidReason?: string;
  voidedByUserId?: Types.ObjectId;
}

const schema = new Schema<PromotionPair>({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  promotionId: { type: Schema.Types.ObjectId, ref: "Promotion", required: true, index: true },
  classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true, index: true },
  payerStudentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  beneficiaryStudentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
  payerEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
  beneficiaryEnrollmentId: { type: Schema.Types.ObjectId, ref: "Enrollment", required: true },
  participantIds: [{ type: Schema.Types.ObjectId, ref: "Student", required: true }],
  assignedAt: { type: Date, default: Date.now },
  benefitFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  benefitTo: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  voidedAt: { type: Date },
  voidReason: { type: String, trim: true, maxlength: 500 },
  voidedByUserId: { type: Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });

schema.index({ organizationId: 1, promotionId: 1, participantIds: 1 }, { unique: true });
schema.index({ organizationId: 1, classId: 1, beneficiaryStudentId: 1, benefitFrom: 1, benefitTo: 1 });

export const PromotionPairModel = model<PromotionPair>("PromotionPair", schema);
