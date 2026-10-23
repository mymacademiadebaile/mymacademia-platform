import { Schema, Types, model } from "mongoose";

export interface TrialBenefit {
  organizationId: Types.ObjectId;
  contactId: Types.ObjectId;
  classId: Types.ObjectId;
  activeBookingId?: Types.ObjectId;
  consumedBookingId?: Types.ObjectId;
  consumedAt?: Date;
}
const schema = new Schema<TrialBenefit>({
  organizationId: { type: Schema.Types.ObjectId, required: true },
  contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
  classId: { type: Schema.Types.ObjectId, ref: "DanceClass", required: true },
  activeBookingId: { type: Schema.Types.ObjectId, ref: "TrialBooking" },
  consumedBookingId: { type: Schema.Types.ObjectId, ref: "TrialBooking" }, consumedAt: Date
}, { timestamps: true });
schema.index({ organizationId: 1, contactId: 1, classId: 1 }, { unique: true });
export const TrialBenefitModel = model<TrialBenefit>("TrialBenefit", schema);
